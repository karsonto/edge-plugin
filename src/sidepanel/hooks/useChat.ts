import { create } from 'zustand';
import type { AIConfig, ChatMessage, ToolCall, ToolResult } from '@/shared/types';
import { sendToBackground, createMessage, onMessage, generateMessageId, truncateText } from '@/shared/utils';
import { getToolDefinitions } from '@/background/automation-model';
import { AIService } from '@/background/ai-service';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentStreamingId: string | null;
  
  sendMessage: (content: string, settings: AIConfig, context?: string) => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: Message) => void;
}

// 辅助函数：通过 content script 执行工具
async function executeToolInContent(call: ToolCall): Promise<ToolResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('未找到活动标签页');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('工具执行超时'));
    }, 15000);

    chrome.tabs.sendMessage(
      tab.id!,
      createMessage('EXECUTE_TOOL', {
        runId: 'chat',
        stepId: generateMessageId(),
        call
      }),
      (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.type === 'TOOL_RESULT') {
          resolve(response.payload.result);
        } else {
          reject(new Error('工具执行返回无效响应'));
        }
      }
    );
  });
}

export const useChat = create<ChatStore>((set, get) => {
  // 监听来自 background 的 AI 响应（仅用于流式模式）
  onMessage((message) => {
    const { currentStreamingId, messages } = get();

    switch (message.type) {
      case 'AI_RESPONSE_START':
        const newMessageId = message.payload.messageId;
        set({
          currentStreamingId: newMessageId,
          messages: [
            ...messages,
            {
              id: newMessageId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
            },
          ],
        });
        break;

      case 'AI_RESPONSE_CHUNK':
        if (message.payload.messageId === currentStreamingId) {
          set({
            messages: messages.map(msg =>
              msg.id === currentStreamingId
                ? { ...msg, content: msg.content + message.payload.chunk }
                : msg
            ),
          });
        }
        break;

      case 'AI_RESPONSE_END':
        if (message.payload.messageId === currentStreamingId) {
          set({
            messages: messages.map(msg =>
              msg.id === currentStreamingId
                ? { ...msg, isStreaming: false }
                : msg
            ),
            isLoading: false,
            currentStreamingId: null,
          });
        }
        break;

      case 'AI_RESPONSE_ERROR':
        if (message.payload.messageId === currentStreamingId) {
          set({
            error: message.payload.error,
            isLoading: false,
            currentStreamingId: null,
            messages: messages.filter(msg => msg.id !== currentStreamingId),
          });
        }
        break;
    }
  });

  // Function Calling 模式处理
  const handleFunctionCallingMode = async (
    _userMessage: Message,
    aiConfig: AIConfig,
    pageContext?: string
  ) => {
    const aiService = new AIService(aiConfig);
    const tools = getToolDefinitions();
    const MAX_RETRIES = 5;
    const MAX_LOOPS = 15;

    // 构建消息历史
    let apiMessages: ChatMessage[] = get().messages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
    }));
    
    // 添加 system context（如果有页面上下文）
    if (pageContext) {
      apiMessages.unshift({
        role: 'system',
        content: `当前页面内容：\n${pageContext.slice(0, 8000)}`,
        timestamp: Date.now()
      });
    }

    let loopCount = 0;

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      console.log(`[Function Calling] 循环 ${loopCount}/${MAX_LOOPS}`);

      try {
        // 调用 AI
        const response = await aiService.chat(apiMessages, {
          tools,
          tool_choice: 'auto'
        });

        // 情况 1：AI 返回最终文本答案
        if (response.content && (!response.tool_calls || response.tool_calls.length === 0)) {
          console.log('[Function Calling] AI 返回最终答案');
          const assistantMessage: Message = {
            id: generateMessageId(),
            role: 'assistant',
            content: response.content,
            timestamp: Date.now()
          };
          set({
            messages: [...get().messages, assistantMessage],
            isLoading: false
          });
          return;
        }

        // 情况 2：AI 调用工具
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`[Function Calling] AI 调用了 ${response.tool_calls.length} 个工具`);

          // 添加 assistant 消息到 API 历史（但不添加到 UI）
          const assistantMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: null,
            tool_calls: response.tool_calls,
            timestamp: Date.now()
          };
          apiMessages.push(assistantMessage);

          // 执行每个工具调用
          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            console.log(`[Function Calling] 执行工具: ${toolName}`, toolArgs);

            // 带重试的工具执行
            const toolResult = await executeToolWithRetry(
              { tool: toolName as any, args: toolArgs },
              MAX_RETRIES
            );

            console.log(`[Function Calling] 工具结果:`, toolResult);

            // 将工具结果添加到 API 消息历史（但不添加到 UI）
            const toolMessage: ChatMessage = {
              id: generateMessageId(),
              role: 'tool',
              content: JSON.stringify(toolResult),
              tool_call_id: toolCall.id,
              name: toolName,
              timestamp: Date.now()
            };
            apiMessages.push(toolMessage);
          }

          // 继续循环，让 AI 基于工具结果决定下一步
          continue;
        }

        // 异常情况：既没有 content 也没有 tool_calls
        throw new Error('AI 未返回有效响应');

      } catch (error) {
        console.error('[Function Calling] 错误:', error);
        throw error;
      }
    }

    // 超过最大循环次数
    throw new Error('执行超时：工具调用次数超过限制');
  };

  // 带重试的工具执行
  const executeToolWithRetry = async (call: ToolCall, maxRetries: number): Promise<ToolResult> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Tool Retry] 尝试 ${attempt}/${maxRetries}: ${call.tool}`);
        
        const result = await executeToolInContent(call);
        
        if (result.ok) {
          console.log(`[Tool Retry] 成功: ${call.tool}`);
          return result;
        } else {
          console.warn(`[Tool Retry] 失败: ${call.tool}`, result.error);
          lastError = new Error(result.error || 'Tool execution failed');
          
          // 如果不是最后一次尝试，等待后重试
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
      } catch (error) {
        console.error(`[Tool Retry] 异常: ${call.tool}`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    // 所有重试都失败
    throw new Error(
      `工具执行失败（已重试 ${maxRetries} 次）: ${call.tool}\n` +
      `错误: ${lastError?.message || 'Unknown error'}`
    );
  };

  // 流式模式处理（保留原有逻辑）
  const handleStreamMode = async (
    userMessage: Message,
    settings: AIConfig,
    context?: string
  ) => {
    try {
      // 准备发送给 AI 的消息
      const chatMessages: ChatMessage[] = get().messages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      // 可选：附带当前网页抓取内容作为 system 上下文
      if (typeof context === 'string' && context.trim()) {
        const ctx = truncateText(context.trim());
        chatMessages.unshift({
          role: 'system',
          content: `以下是当前网页抓取内容（仅供参考，回答时不必逐字复述）：\n\n${ctx}`,
          timestamp: Date.now(),
        });
      }

      // 添加当前用户消息
      chatMessages.push({
        id: userMessage.id,
        role: 'user',
        content: userMessage.content,
        timestamp: userMessage.timestamp,
      });

      // 发送到 background
      const response: any = await sendToBackground(
        createMessage('SEND_TO_AI', {
          messages: chatMessages,
          settings,
        })
      );

      // background 可能直接返回错误对象
      if (response?.type === 'ERROR') {
        throw new Error(response?.payload?.error || 'AI 请求失败');
      }
    } catch (error) {
      throw error;
    }
  };

  return {
    messages: [],
    isLoading: false,
    error: null,
    currentStreamingId: null,

    sendMessage: async (content: string, settings: AIConfig, context?: string) => {
      if (!content.trim()) return;

      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      set({
        messages: [...get().messages, userMessage],
        isLoading: true,
        error: null,
      });

      try {
        // 判断是否启用 function calling
        if (settings.enableFunctionCalling) {
          console.log('[Function Calling] 模式已启用');
          await handleFunctionCallingMode(userMessage, settings, context);
        } else {
          // 流式模式（现有逻辑）
          await handleStreamMode(userMessage, settings, context);
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false,
        });
      }
    },

    clearMessages: () => {
      set({ messages: [], error: null });
    },

    addMessage: (message: Message) => {
      set({ messages: [...get().messages, message] });
    },
  };
});
