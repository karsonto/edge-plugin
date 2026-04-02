import { create } from 'zustand';
import { Agent, type AgentEvent } from '@mariozechner/pi-agent-core';
import type { AIConfig, ChatMessage, PageContext } from '@/shared/types';
import { sendToBackground, createMessage, onMessage, generateMessageId, truncateText } from '@/shared/utils';
import {
  createBrowserAgent,
  extractAssistantText,
  getBrowserAgentConfigKey,
} from '@/sidepanel/agent/browser-agent';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  kind?: 'default' | 'tool_log';
  toolLog?: {
    toolName: string;
    status: 'running' | 'success' | 'error';
    summary: string;
    intent?: string;
    args?: Record<string, any>;
    resultText?: string;
    details?: unknown;
  };
}

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentStreamingId: string | null;
  lastPageUrl: string | null;

  sendMessage: (content: string, settings: AIConfig, pageContext?: PageContext) => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: Message) => void;
  stop: () => void;
}

export const useChat = create<ChatStore>((set, get) => {
  let shouldStop = false;
  let currentAbortController: AbortController | null = null;
  let browserAgent: Agent | null = null;
  let browserAgentConfigKey: string | null = null;
  let unsubscribeBrowserAgent: (() => void) | null = null;
  let injectedPageContext: string | null = null;
  let currentAgentAssistantUiId: string | null = null;
  let currentToolStatusMessageId: string | null = null;

  const getToolIntent = (toolName: string, args: Record<string, any> | undefined) => {
    if (!args) return `执行工具 \`${toolName}\``;

    switch (toolName) {
      case 'findByText':
        return `查找文本「${args.text || ''}」`;
      case 'query':
        return `查询选择器 \`${args.selector || ''}\``;
      case 'inspectElement':
        return `检查元素 \`${args.elementId || args.selector || args.targetText || ''}\``;
      case 'getValue':
        return `读取元素 \`${args.elementId || args.selector || args.targetText || ''}\``;
      case 'interact': {
        const target = args.elementId || args.selector || args.targetText || '目标元素';
        return `执行 \`${args.action || 'interact'}\` 于 \`${target}\``;
      }
      case 'waitFor':
        return `等待 \`${args.text || args.selector || '页面状态变化'}\``;
      case 'screenshotPage':
        return `截图页面（${args.mode || 'fullpage'}）`;
      default:
        return `执行工具 \`${toolName}\``;
    }
  };

  const formatToolStartMessage = (toolName: string, args: Record<string, any> | undefined) => {
    return {
      toolName,
      status: 'running' as const,
      summary: `正在执行 ${toolName}`,
      intent: getToolIntent(toolName, args),
      args: args || {},
    };
  };

  const formatToolEndMessage = (toolName: string, result: any, isError: boolean) => {
    const resultText =
      Array.isArray(result?.content)
        ? result.content
            .filter((item: any) => item?.type === 'text')
            .map((item: any) => item.text)
            .join('\n')
        : '';

    const details = result?.details;

    if (isError) {
      return {
        toolName,
        status: 'error' as const,
        summary: `执行失败：${toolName}`,
        resultText: resultText || 'Unknown error',
        details: details || {},
      };
    }

    return {
      toolName,
      status: 'success' as const,
      summary: `执行完成：${toolName}`,
      resultText: resultText || undefined,
      details: details || {},
    };
  };

  const addAssistantStatusMessage = (toolLog: NonNullable<Message['toolLog']>) => {
    const id = generateMessageId();
    currentToolStatusMessageId = id;
    set({
      messages: [
        ...get().messages,
        {
          id,
          role: 'assistant',
          content: toolLog.summary,
          timestamp: Date.now(),
          isStreaming: false,
          kind: 'tool_log',
          toolLog,
        },
      ],
    });
  };

  const updateAssistantStatusMessage = (toolLog: NonNullable<Message['toolLog']>) => {
    if (!currentToolStatusMessageId) {
      addAssistantStatusMessage(toolLog);
      return;
    }

    const targetId = currentToolStatusMessageId;
    currentToolStatusMessageId = null;
    set({
      messages: get().messages.map((msg) => {
        if (msg.id !== targetId) return msg;

        const previousToolLog = msg.toolLog;
        const mergedToolLog = {
          ...previousToolLog,
          ...toolLog,
          toolName: toolLog.toolName || previousToolLog?.toolName || 'unknown',
          summary: toolLog.summary || previousToolLog?.summary || '',
          status: toolLog.status || previousToolLog?.status || 'success',
          intent: toolLog.intent ?? previousToolLog?.intent,
          args: toolLog.args ?? previousToolLog?.args,
          resultText: toolLog.resultText ?? previousToolLog?.resultText,
          details: toolLog.details ?? previousToolLog?.details,
        } as NonNullable<Message['toolLog']>;

        return {
          ...msg,
          content: mergedToolLog.summary,
          isStreaming: false,
          kind: 'tool_log',
          toolLog: mergedToolLog,
        };
      }),
    });
  };

  const upsertStreamingAssistant = (delta: string) => {
    if (!currentAgentAssistantUiId) {
      currentAgentAssistantUiId = generateMessageId();
      set({
        messages: [
          ...get().messages,
          {
            id: currentAgentAssistantUiId,
            role: 'assistant',
            content: delta,
            timestamp: Date.now(),
            isStreaming: true,
          },
        ],
      });
      return;
    }

    set({
      messages: get().messages.map((msg) =>
        msg.id === currentAgentAssistantUiId ? { ...msg, content: msg.content + delta } : msg
      ),
    });
  };

  const finalizeStreamingAssistant = (content: string) => {
    if (!currentAgentAssistantUiId) {
      if (!content.trim()) return;
      set({
        messages: [
          ...get().messages,
          {
            id: generateMessageId(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
            isStreaming: false,
          },
        ],
      });
      return;
    }

    set({
      messages: get().messages.map((msg) =>
        msg.id === currentAgentAssistantUiId
          ? { ...msg, content, isStreaming: false }
          : msg
      ),
    });
    currentAgentAssistantUiId = null;
  };

  const removeStreamingAssistant = () => {
    if (!currentAgentAssistantUiId) return;
    const targetId = currentAgentAssistantUiId;
    currentAgentAssistantUiId = null;
    set({
      messages: get().messages.filter((msg) => msg.id !== targetId),
    });
  };

  const handleBrowserAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        if ((event.message as any)?.role === 'assistant') {
          currentAgentAssistantUiId = null;
        }
        break;

      case 'message_update':
        if (
          (event.message as any)?.role === 'assistant' &&
          event.assistantMessageEvent.type === 'text_delta'
        ) {
          upsertStreamingAssistant(event.assistantMessageEvent.delta);
        }
        break;

      case 'message_end':
        if ((event.message as any)?.role !== 'assistant') {
          break;
        }

        if ((event.message as any)?.stopReason === 'toolUse') {
          const content = extractAssistantText(event.message).trim();
          if (content) {
            finalizeStreamingAssistant(content);
          } else {
            removeStreamingAssistant();
          }
          break;
        }

        finalizeStreamingAssistant(extractAssistantText(event.message));
        break;

      case 'tool_execution_start':
        addAssistantStatusMessage(formatToolStartMessage(event.toolName, event.args));
        break;

      case 'tool_execution_end':
        updateAssistantStatusMessage(formatToolEndMessage(event.toolName, event.result, event.isError));
        break;

      case 'agent_end':
        set({
          isLoading: false,
          error: browserAgent?.state.error || null,
        });
        currentToolStatusMessageId = null;
        break;
    }
  };

  const ensureBrowserAgent = (settings: AIConfig) => {
    const nextConfigKey = getBrowserAgentConfigKey(settings);
    if (browserAgent && browserAgentConfigKey === nextConfigKey) {
      return browserAgent;
    }

    const previousMessages = browserAgent?.state.messages;
    unsubscribeBrowserAgent?.();

    browserAgent = createBrowserAgent(
      settings,
      () => injectedPageContext,
      previousMessages
    );
    browserAgentConfigKey = nextConfigKey;
    unsubscribeBrowserAgent = browserAgent.subscribe(handleBrowserAgentEvent);
    return browserAgent;
  };

  onMessage((message) => {
    const { currentStreamingId, messages } = get();

    switch (message.type) {
      case 'AI_RESPONSE_START': {
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
      }

      case 'AI_RESPONSE_CHUNK':
        if (message.payload.messageId === currentStreamingId) {
          set({
            messages: messages.map((msg) =>
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
            messages: messages.map((msg) =>
              msg.id === currentStreamingId ? { ...msg, isStreaming: false } : msg
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
            messages: messages.filter((msg) => msg.id !== currentStreamingId),
          });
        }
        break;
    }
  });

  const handleBrowserAutomationMode = async (
    userMessage: Message,
    settings: AIConfig,
    pageContent?: string
  ) => {
    shouldStop = false;
    injectedPageContext = pageContent || null;

    try {
      const agent = ensureBrowserAgent(settings);
      await agent.prompt(userMessage.content);

      if (agent.state.error) {
        throw new Error(agent.state.error);
      }
    } finally {
      injectedPageContext = null;
    }
  };

  const handleStreamMode = async (
    userMessage: Message,
    settings: AIConfig,
    context?: string
  ) => {
    shouldStop = false;
    currentAbortController = new AbortController();

    try {
      const chatMessages: ChatMessage[] = get().messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      if (typeof context === 'string' && context.trim()) {
        const ctx = truncateText(context.trim());
        chatMessages.unshift({
          role: 'system',
          content: `以下是当前网页抓取内容（仅供参考，回答时不必逐字复述）：\n\n${ctx}`,
          timestamp: Date.now(),
        });
      }

      chatMessages.push({
        id: userMessage.id,
        role: 'user',
        content: userMessage.content,
        timestamp: userMessage.timestamp,
      });

      const response: any = await sendToBackground(
        createMessage('SEND_TO_AI', {
          messages: chatMessages,
          settings,
        })
      );

      if (response?.type === 'ERROR') {
        throw new Error(response?.payload?.error || 'AI 请求失败');
      }
    } catch (error) {
      if (shouldStop) {
        set({
          isLoading: false,
          messages: [
            ...get().messages,
            {
              id: generateMessageId(),
              role: 'assistant',
              content: '操作已中断。',
              timestamp: Date.now(),
            },
          ],
        });
        return;
      }
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

      const { lastPageUrl } = get();
      const currentUrl = pageContext?.url;
      const shouldIncludeContent = pageContext && currentUrl !== lastPageUrl;

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
        if (settings.enableFunctionCalling) {
          console.log('[Browser Automation] 模式已启用');
          await handleBrowserAutomationMode(
            userMessage,
            settings,
            shouldIncludeContent ? pageContext.content : undefined
          );
        } else {
          await handleStreamMode(
            userMessage,
            settings,
            shouldIncludeContent ? pageContext.content : undefined
          );
        }
      } catch (error) {
        if (shouldStop) {
          set({
            isLoading: false,
            messages: [
              ...get().messages,
              {
                id: generateMessageId(),
                role: 'assistant',
                content: '操作已中断。',
                timestamp: Date.now(),
              },
            ],
          });
          return;
        }

        set({
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false,
        });
      }
    },

    clearMessages: () => {
      browserAgent?.reset();
      currentAgentAssistantUiId = null;
      currentToolStatusMessageId = null;
      set({ messages: [], error: null, lastPageUrl: null });
    },

    addMessage: (message: Message) => {
      set({ messages: [...get().messages, message] });
    },

    stop: () => {
      shouldStop = true;
      browserAgent?.abort();
      currentToolStatusMessageId = null;
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      set({ isLoading: false });
    },
  };
});
