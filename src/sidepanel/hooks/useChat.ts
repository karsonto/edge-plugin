import { create } from 'zustand';
import type { AIConfig, ChatMessage, PageContext, ToolCall, ToolResult } from '@/shared/types';
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
  lastPageUrl: string | null;  // 记录已发送过的页面 URL，避免重复传入
  
  sendMessage: (content: string, settings: AIConfig, pageContext?: PageContext) => Promise<void>;
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

  // ============ 调试日志工具函数 ============
  const logStyles = {
    title: 'color: #fff; background: #6366f1; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
    info: 'color: #3b82f6;',
    success: 'color: #22c55e; font-weight: bold;',
    warning: 'color: #f59e0b; font-weight: bold;',
    error: 'color: #ef4444; font-weight: bold;',
    tool: 'color: #8b5cf6; font-weight: bold;',
    data: 'color: #6b7280;',
  };

  const logFC = {
    start: (userMessage: string) => {
      console.group('%c🤖 Function Calling 开始', logStyles.title);
      console.log('%c用户消息:', logStyles.info, userMessage);
      console.log('%c时间:', logStyles.data, new Date().toLocaleTimeString());
      console.groupEnd();
    },
    loop: (count: number, max: number) => {
      console.log(`%c━━━ 循环 ${count}/${max} ━━━`, logStyles.info);
    },
    aiRequest: (messages: any[], hasTools: boolean) => {
      console.group('%c📤 AI 请求', logStyles.info);
      console.log('%c消息数量:', logStyles.data, messages.length);
      console.log('%c携带工具:', logStyles.data, hasTools ? '是' : '否（强制文本回复）');
      console.log('%c完整消息:', logStyles.data);
      console.table(messages.map(m => ({
        role: m.role,
        content: m.content?.slice(0, 100) + (m.content?.length > 100 ? '...' : ''),
        tool_calls: m.tool_calls?.length || 0
      })));
      console.groupEnd();
    },
    aiResponse: (response: any) => {
      console.group('%c📥 AI 响应', logStyles.info);
      console.log('%c有文本内容:', logStyles.data, !!response.content);
      console.log('%c工具调用数:', logStyles.data, response.tool_calls?.length || 0);
      if (response.content) {
        console.log('%c文本内容:', logStyles.data, response.content.slice(0, 200) + (response.content.length > 200 ? '...' : ''));
      }
      if (response.tool_calls?.length > 0) {
        console.log('%c工具调用:', logStyles.tool);
        response.tool_calls.forEach((tc: any, i: number) => {
          console.log(`  ${i + 1}. ${tc.function.name}`, JSON.parse(tc.function.arguments || '{}'));
        });
      }
      console.groupEnd();
    },
    toolStart: (name: string, args: any, callId: string) => {
      console.group(`%c🔧 执行工具: ${name}`, logStyles.tool);
      console.log('%cCall ID:', logStyles.data, callId);
      console.log('%c输入参数:', logStyles.data);
      console.log(JSON.stringify(args, null, 2));
    },
    toolEnd: (name: string, result: any, duration: number) => {
      const status = result.ok ? '✅ 成功' : '❌ 失败';
      console.log(`%c${name} ${status}`, result.ok ? logStyles.success : logStyles.error);
      console.log('%c执行耗时:', logStyles.data, `${duration}ms`);
      console.log('%c输出结果:', logStyles.data);
      console.log(JSON.stringify(result, null, 2));
      console.groupEnd();
    },
    finalAnswer: (content: string) => {
      console.group('%c✨ 最终答案', logStyles.success);
      console.log(content);
      console.groupEnd();
    },
    error: (error: any) => {
      console.group('%c💥 错误', logStyles.error);
      console.error(error);
      console.groupEnd();
    },
    end: (toolsExecuted: string[], loopCount: number) => {
      console.group('%c🏁 Function Calling 结束', logStyles.title);
      console.log('%c总循环次数:', logStyles.data, loopCount);
      console.log('%c执行的工具:', logStyles.data, toolsExecuted.length > 0 ? toolsExecuted.join(' → ') : '无');
      console.groupEnd();
    }
  };

  // Function Calling 模式处理
  const handleFunctionCallingMode = async (
    _userMessage: Message,
    aiConfig: AIConfig,
    pageContent?: string  // 已经去重过的页面内容
  ) => {
    const aiService = new AIService(aiConfig);
    const tools = getToolDefinitions();
    const MAX_RETRIES = 5;
    const MAX_LOOPS = 10;

    // 终结性工具：执行后应该直接给出结果
    const TERMINAL_TOOLS = ['download', 'screenshot'];

    // 开始日志
    logFC.start(_userMessage.content);

    // 构建消息历史
    let apiMessages: ChatMessage[] = get().messages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
    }));
    
    // 添加 system prompt 指导 AI 行为
    apiMessages.unshift({
      role: 'system',
      content: `你是一个浏览器自动化助手。规则：
1. 完成用户请求后，必须用自然语言回复用户（不要继续调用工具）
2. 如果工具执行成功（如下载、截图），直接告诉用户结果
3. 不要重复调用同一个工具
4. 每次最多调用 1-2 个工具`,
      timestamp: Date.now()
    });

    // 添加页面上下文（如果有，已经过去重处理）
    if (pageContent) {
      apiMessages.push({
        role: 'system',
        content: `当前页面内容：\n${pageContent}`,
        timestamp: Date.now()
      });
    }

    let loopCount = 0;
    let lastToolResults: string[] = [];

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      logFC.loop(loopCount, MAX_LOOPS);

      try {
        // 如果已经执行过终结性工具，强制 AI 返回文本
        const shouldForceResponse = lastToolResults.some(t => TERMINAL_TOOLS.includes(t));
        
        // 日志：AI 请求
        logFC.aiRequest(apiMessages, !shouldForceResponse);

        // 调用 AI
        const response = await aiService.chat(apiMessages, {
          tools: shouldForceResponse ? undefined : tools,
          tool_choice: shouldForceResponse ? undefined : 'auto'
        });

        // 日志：AI 响应
        logFC.aiResponse(response);

        // 情况 1：AI 返回最终文本答案
        if (response.content && (!response.tool_calls || response.tool_calls.length === 0)) {
          logFC.finalAnswer(response.content);
          logFC.end(lastToolResults, loopCount);
          
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
          // 添加 assistant 消息到 API 历史（但不添加到 UI）
          const assistantMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: response.content || null,
            tool_calls: response.tool_calls,
            timestamp: Date.now()
          };
          apiMessages.push(assistantMessage);

          // 执行每个工具调用
          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs: Record<string, any> = {};
            
            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (e) {
              console.warn(`%c⚠️ 解析工具参数失败`, logStyles.warning, toolCall.function.arguments);
            }

            // 日志：工具开始
            logFC.toolStart(toolName, toolArgs, toolCall.id);
            const startTime = Date.now();

            // 带重试的工具执行
            const toolResult = await executeToolWithRetry(
              { tool: toolName as any, args: toolArgs },
              MAX_RETRIES
            );

            // 日志：工具结束
            logFC.toolEnd(toolName, toolResult, Date.now() - startTime);

            // 记录已执行的工具
            lastToolResults.push(toolName);

            // 将工具结果添加到 API 消息历史
            const toolMessage: ChatMessage = {
              id: generateMessageId(),
              role: 'tool',
              content: JSON.stringify(toolResult),
              tool_call_id: toolCall.id,
              name: toolName,
              timestamp: Date.now()
            };
            apiMessages.push(toolMessage);

            // 如果是终结性工具且执行成功，添加提示让 AI 返回结果
            if (TERMINAL_TOOLS.includes(toolName) && toolResult.ok) {
              apiMessages.push({
                role: 'system',
                content: `工具 ${toolName} 已成功执行。请用自然语言告诉用户结果，不要再调用工具。`,
                timestamp: Date.now()
              });
            }
          }

          // 继续循环，让 AI 基于工具结果决定下一步
          continue;
        }

        // 情况 3：既没有 content 也没有 tool_calls，尝试强制获取回复
        console.warn('%c⚠️ AI 未返回有效响应，尝试强制获取回复', logStyles.warning);
        const forceResponse = await aiService.chat([
          ...apiMessages,
          { role: 'user', content: '请用自然语言回复用户', timestamp: Date.now() }
        ]);
        
        if (forceResponse.content) {
          logFC.finalAnswer(forceResponse.content);
          logFC.end(lastToolResults, loopCount);
          
          const assistantMessage: Message = {
            id: generateMessageId(),
            role: 'assistant',
            content: forceResponse.content,
            timestamp: Date.now()
          };
          set({
            messages: [...get().messages, assistantMessage],
            isLoading: false
          });
          return;
        }

        throw new Error('AI 未返回有效响应');

      } catch (error) {
        logFC.error(error);
        throw error;
      }
    }

    // 超过最大循环次数，但尝试给出一个回复
    console.warn('%c⚠️ 达到最大循环次数，生成默认回复', logStyles.warning);
    logFC.end(lastToolResults, loopCount);
    const defaultMessage: Message = {
      id: generateMessageId(),
      role: 'assistant',
      content: lastToolResults.length > 0 
        ? `已执行操作：${lastToolResults.join('、')}。如果有其他问题，请继续提问。`
        : '抱歉，操作未能完成。请重试或简化您的请求。',
      timestamp: Date.now()
    };
    set({
      messages: [...get().messages, defaultMessage],
      isLoading: false
    });
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
    lastPageUrl: null,

    sendMessage: async (content: string, settings: AIConfig, pageContext?: PageContext) => {
      if (!content.trim()) return;

      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      // 判断是否需要传入页面内容（URL 去重）
      const { lastPageUrl } = get();
      const currentUrl = pageContext?.url;
      const shouldIncludeContent = pageContext && currentUrl !== lastPageUrl;
      
      // 如果需要传入新内容，更新 lastPageUrl
      if (shouldIncludeContent && currentUrl) {
        set({ lastPageUrl: currentUrl });
        console.log('[PageContext] 传入页面内容，URL:', currentUrl);
      } else if (pageContext && currentUrl === lastPageUrl) {
        console.log('[PageContext] 跳过重复页面内容，URL:', currentUrl);
      }

      set({
        messages: [...get().messages, userMessage],
        isLoading: true,
        error: null,
      });

      try {
        // 判断是否启用 function calling
        if (settings.enableFunctionCalling) {
          console.log('[Function Calling] 模式已启用');
          await handleFunctionCallingMode(
            userMessage, 
            settings, 
            shouldIncludeContent ? pageContext.content : undefined
          );
        } else {
          // 流式模式（现有逻辑）
          await handleStreamMode(
            userMessage, 
            settings, 
            shouldIncludeContent ? pageContext.content : undefined
          );
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false,
        });
      }
    },

    clearMessages: () => {
      set({ messages: [], error: null, lastPageUrl: null });
    },

    addMessage: (message: Message) => {
      set({ messages: [...get().messages, message] });
    },
  };
});
