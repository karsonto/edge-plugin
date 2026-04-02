/**
 * 消息处理器
 */

import type { CaptureVisibleTabMessage, Message, PageContext } from '@/shared/types';
import { AIService } from './ai-service';
import { storageManager } from './storage-manager';
import { createMessage, generateMessageId } from '@/shared/utils/message-bridge';
import { parsePDFBuffer } from '@/shared/utils/file-parser';
import { captureVisibleTab } from './screenshot-service';

/**
 * 处理来自 content script 或 sidepanel 的消息
 */
export async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): Promise<boolean> {
  console.log('Background received message:', message.type);

  try {
    switch (message.type) {
      case 'GET_PAGE_CONTEXT':
        await handleGetPageContext(message, sender, sendResponse);
        return true;

      case 'SEND_TO_AI':
        await handleSendToAI(message, sendResponse);
        return true;

      case 'CAPTURE_VISIBLE_TAB':
        await handleCaptureVisibleTab(message as CaptureVisibleTabMessage, sender, sendResponse);
        return true;

      case 'SAVE_SETTINGS':
        await handleSaveSettings(message, sendResponse);
        return false;

      case 'LOAD_SETTINGS':
        await handleLoadSettings(sendResponse);
        return false;

      case 'REFRESH_PAGE_CONTEXT':
        // 转发刷新请求到 sidepanel
        // 不返回 true，让消息继续传递到其他监听者（如 sidepanel）
        console.log('[Background] 收到刷新页面内容请求，转发到 sidepanel');
        // 不调用 sendResponse，让消息继续传递
        return false;

      default:
        console.warn('Unknown message type:', message.type);
        return false;
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    return false;
  }
}

/**
 * 处理获取页面上下文
 */
async function handleGetPageContext(
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const targetTabId =
    sender.tab?.id ??
    // sidepanel 通过 runtime.sendMessage 过来时，sender.tab 可能不存在
    (message as any)?.payload?.tabId;

  if (!targetTabId) {
    throw new Error('No tab ID');
  }

  // 获取当前标签信息
  const tab = await chrome.tabs.get(targetTabId);
  const url = tab.url || '';

  // 简单判断是否为 PDF 页面（URL 以 .pdf 结尾或包含 .pdf? / .pdf#）
  const isPdf = /\.pdf(\?|#|$)/i.test(url);

  if (isPdf) {
    try {
      // 在 background 中直接拉取 PDF 文件
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`获取 PDF 失败: ${resp.status} ${resp.statusText}`);
      }

      const arrayBuffer = await resp.arrayBuffer();
      const { content } = await parsePDFBuffer(arrayBuffer);

      const context: PageContext = {
        title: tab.title || 'PDF 文档',
        url,
        content,
        selectedText: undefined,
        metadata: {
          wordCount: content.length,
          readingTime: Math.ceil(content.length / 500),
        },
        timestamp: Date.now(),
      };

      const responseMessage = createMessage('PAGE_CONTEXT_RESPONSE', {
        ...context,
        metadata: {
          author: undefined,
          publishDate: undefined,
          wordCount: context.metadata.wordCount,
        },
      });

      // 保存到存储
      storageManager.savePageContext(context);
      sendResponse(responseMessage);
      return;
    } catch (error) {
      console.error('Error parsing PDF page context:', error);
      sendResponse({
        type: 'ERROR',
        payload: {
          error: error instanceof Error ? error.message : '解析 PDF 失败',
        },
      });
      return;
    }
  }

  // 非 PDF 页面：发送消息到 content script 由 DOM 文本提取模块处理
  chrome.tabs.sendMessage(
    targetTabId,
    createMessage('GET_PAGE_CONTEXT'),
    (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          type: 'ERROR',
          payload: { error: chrome.runtime.lastError.message },
        });
      } else {
        // 保存到存储
        if (response?.payload) {
          storageManager.savePageContext(response.payload);
        }
        sendResponse(response);
      }
    }
  );
}

/**
 * 处理发送到 AI
 */
async function handleSendToAI(
  message: any,
  sendResponse: (response?: any) => void
) {
  const { messages, settings } = message.payload;
  const messageId = generateMessageId();

  // 创建 AI 服务实例
  const aiService = new AIService(settings);

  // 发送开始消息
  chrome.runtime.sendMessage(
    createMessage('AI_RESPONSE_START', { messageId })
  );

  try {
    // 流式响应
    for await (const chunk of aiService.streamChat(messages)) {
      // 发送每个片段
      chrome.runtime.sendMessage(
        createMessage('AI_RESPONSE_CHUNK', { messageId, chunk })
      );
    }

    // 发送结束消息
    chrome.runtime.sendMessage(
      createMessage('AI_RESPONSE_END', { messageId })
    );

    sendResponse({ success: true });
  } catch (error) {
    console.error('AI service error:', error);
    
    // 发送错误消息
    chrome.runtime.sendMessage(
      createMessage('AI_RESPONSE_ERROR', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );

    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

async function handleCaptureVisibleTab(
  message: CaptureVisibleTabMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const result = await captureVisibleTab({
    windowId: sender.tab?.windowId,
    format: message.payload?.format,
    quality: message.payload?.quality,
  });

  sendResponse({ ok: true, ...result });
}

/**
 * 处理保存设置
 */
async function handleSaveSettings(
  message: any,
  sendResponse: (response?: any) => void
) {
  await storageManager.saveConfig(message.payload);
  sendResponse({ success: true });
}

/**
 * 处理加载设置
 */
async function handleLoadSettings(sendResponse: (response?: any) => void) {
  const config = await storageManager.loadConfig();
  sendResponse(
    createMessage('SETTINGS_RESPONSE', config)
  );
}
