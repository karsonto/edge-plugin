/**
 * 消息处理器
 */

import type { Message } from '@/shared/types';
import { AIService } from './ai-service';
import { storageManager } from './storage-manager';
import { createMessage, generateMessageId } from '@/shared/utils/message-bridge';
import { automationOrchestrator } from './automation-orchestrator';
import { takeScreenshot, downloadFile, type ScreenshotOptions, type DownloadOptions } from './media-service';

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

      case 'RUN_AUTOMATION':
        await handleRunAutomation(message as any, sendResponse);
        return true;

      case 'STOP_AUTOMATION':
        await handleStopAutomation(message as any, sendResponse);
        return false;

      case 'CONFIRMATION_RESPONSE':
        await handleConfirmationResponse(message as any, sendResponse);
        return false;

      case 'LOAD_AUTOMATION_HISTORY':
        await handleLoadAutomationHistory(sendResponse);
        return false;

      case 'SAVE_SETTINGS':
        await handleSaveSettings(message, sendResponse);
        return false;

      case 'LOAD_SETTINGS':
        await handleLoadSettings(sendResponse);
        return false;

      case 'TAKE_SCREENSHOT':
        await handleTakeScreenshot(message as any, sender, sendResponse);
        return true;

      case 'DOWNLOAD_FILE':
        await handleDownloadFile(message as any, sendResponse);
        return true;

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

async function handleLoadAutomationHistory(sendResponse: (response?: any) => void) {
  const history = await storageManager.loadAutomationHistory();
  sendResponse(createMessage('AUTOMATION_HISTORY_RESPONSE', history));
}

async function handleRunAutomation(message: any, sendResponse: (response?: any) => void) {
  const { tabId, goal, context } = message.payload || {};
  if (!tabId || !goal) {
    sendResponse({ type: 'ERROR', payload: { error: 'Missing tabId or goal' } });
    return;
  }
  const runId = await automationOrchestrator.start(tabId, goal, context);
  sendResponse({ success: true, runId });
}

async function handleStopAutomation(message: any, sendResponse: (response?: any) => void) {
  const { runId } = message.payload || {};
  if (!runId) {
    sendResponse({ type: 'ERROR', payload: { error: 'Missing runId' } });
    return;
  }
  automationOrchestrator.stop(runId);
  sendResponse({ success: true });
}

async function handleConfirmationResponse(message: any, sendResponse: (response?: any) => void) {
  const { runId, stepId, approved } = message.payload || {};
  if (!runId || !stepId) {
    sendResponse({ type: 'ERROR', payload: { error: 'Missing runId or stepId' } });
    return;
  }
  automationOrchestrator.confirm(runId, stepId, !!approved);
  sendResponse({ success: true });
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

  // 发送消息到 content script
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

/**
 * 处理截图请求
 */
async function handleTakeScreenshot(
  message: { payload: ScreenshotOptions },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: 'No tab ID' });
    return;
  }

  const result = await takeScreenshot(tabId, message.payload);
  sendResponse(result);
}

/**
 * 处理下载请求
 */
async function handleDownloadFile(
  message: { payload: DownloadOptions },
  sendResponse: (response?: any) => void
) {
  const result = await downloadFile(message.payload);
  sendResponse(result);
}
