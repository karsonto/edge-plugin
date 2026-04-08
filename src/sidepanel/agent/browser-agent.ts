import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import { Type, getModel, type Model } from '@mariozechner/pi-ai';
import type {
  AIConfig,
  ElementSummary,
  InspectElementData,
  InteractResultData,
  SelectedScreenshotTarget,
  ScreenshotResultData,
  ToolCall,
  ToolResult,
  WaitForResultData,
} from '@/shared/types';
import { truncateText } from '@/shared/utils';
import { executeToolInContent } from './content-tool-bridge';

const BROWSER_AGENT_SYSTEM_PROMPT = `你是浏览器自动化助手，负责读取页面并完成低风险网页操作。
规则：
1. 默认先读取后操作
2. 优先使用 findByText/query 获取 elementId，再使用 elementId 操作
3. 对常见表单字段，优先直接使用 targetText + targetRole="field" 进行 inspectElement / interact / getValue
4. 当需要视觉确认布局、图表、颜色、截图证据时，使用 screenshotPage；优先一次截图解决问题，不要反复整页读取
5. 如果用户已经明确选中了截图目标元素，优先对该目标截图；否则按页面截图
6. 一次只执行一个动作工具
7. 动作后必须验证结果，再决定下一步
8. 不要重复读取整页，优先做局部检查
9. 连续失败或无法确认页面状态时，停止并请求用户澄清
10. 完成任务后，用简洁自然语言汇报结果`;

function normalizeCustomEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();

    if (host.includes('deepseek')) {
      const path = url.pathname.replace(/\/+$/, '');
      if (path === '' || path === '/') {
        url.pathname = '/v1/chat/completions';
      } else if (path === '/chat/completion' || path === '/chat/completions') {
        url.pathname = '/v1/chat/completions';
      } else if (path === '/v1/chat/completion') {
        url.pathname = '/v1/chat/completions';
      }
    }

    return url.toString();
  } catch {
    return endpoint;
  }
}

function toOpenAIBaseUrl(endpoint: string): string {
  const normalized = normalizeCustomEndpoint(endpoint);
  try {
    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');

    const suffixes = ['/v1/chat/completions', '/chat/completions'];
    for (const suffix of suffixes) {
      if (path.endsWith(suffix)) {
        const nextPath = path.slice(0, -suffix.length) || (suffix.startsWith('/v1') ? '/v1' : '');
        url.pathname = nextPath || '/';
        return url.toString().replace(/\/$/, '');
      }
    }

    return normalized.replace(/\/$/, '');
  } catch {
    return normalized.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  }
}

function createOpenAICompatibleModel(config: AIConfig): Model<'openai-completions'> {
  const endpoint =
    config.provider === 'custom' && config.customEndpoint
      ? config.customEndpoint
      : 'https://api.openai.com/v1/chat/completions';

  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: config.provider === 'custom' ? 'custom' : 'openai',
    baseUrl: toOpenAIBaseUrl(endpoint),
    reasoning: false,
    input: ['text', 'image'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: config.maxTokens || 65535,
    compat: {
      maxTokensField: 'max_tokens',
      supportsUsageInStreaming: false,
      supportsStrictMode: false,
    },
  };
}

function createModelFromConfig(config: AIConfig): Model<any> {
  if (config.provider === 'openai' || config.provider === 'custom') {
    return createOpenAICompatibleModel(config);
  }

  try {
    return getModel(config.provider as any, config.model as any);
  } catch {
    throw new Error(`当前自动化模式暂不支持提供商 ${config.provider} / 模型 ${config.model}`);
  }
}

function summarizeElement(element?: ElementSummary) {
  if (!element) return 'unknown element';
  const pieces = [element.tag, element.labelText, element.text, element.placeholder].filter(Boolean);
  return pieces.join(' | ') || element.id;
}

function summarizeToolResult(result: ToolResult): string {
  if (!result.ok) {
    return `${result.tool}: error - ${result.error || 'unknown error'}`;
  }

  switch (result.tool) {
    case 'getPageInfo': {
      const data = result.data as { title?: string; url?: string } | undefined;
      return `getPageInfo: ${data?.title || 'untitled'} (${data?.url || ''})`;
    }
    case 'query':
    case 'findByText': {
      const data = result.data as { elements?: ElementSummary[] } | undefined;
      const elements = (data?.elements || []).slice(0, 5);
      const summary = elements.map((item) => `${item.id}:${summarizeElement(item)}`).join('; ');
      return `${result.tool}: found ${data?.elements?.length || 0} element(s)${summary ? ` -> ${summary}` : ''}`;
    }
    case 'inspectElement': {
      const data = result.data as InspectElementData | undefined;
      return `inspectElement: ${summarizeElement(data?.element)} nearby=${truncateText(data?.nearbyText || '', 60)} value=${truncateText(data?.value || '', 60)}`;
    }
    case 'getValue': {
      const data = result.data as { value?: string; text?: string; checked?: boolean; attribute?: string } | undefined;
      const mainValue = data?.value ?? data?.text ?? '';
      return `getValue: ${truncateText(String(mainValue), 80)}${data?.checked !== undefined ? ` checked=${data.checked}` : ''}`;
    }
    case 'interact': {
      const data = result.data as InteractResultData | undefined;
      return `interact: ${data?.action} ${summarizeElement(data?.target)} success=${data?.success ? 'yes' : 'no'}${data?.valuePreview ? ` value=${truncateText(data.valuePreview, 60)}` : ''}`;
    }
    case 'waitFor': {
      const data = result.data as WaitForResultData | undefined;
      return `waitFor: matched=${data?.matched ? 'yes' : 'no'} elapsed=${data?.elapsedMs || 0}ms condition=${data?.condition || ''}`;
    }
    case 'getVisibleText': {
      const data = result.data as { text?: string } | undefined;
      return `getVisibleText: ${truncateText(data?.text || '', 240)}`;
    }
    case 'screenshotPage': {
      const data = result.data as ScreenshotResultData | undefined;
      return `screenshotPage: ${data?.targetType || 'page'} ${data?.mode || 'fullpage'} ${data?.width || 0}x${data?.height || 0} tiles=${data?.tileCount || 0} scale=${data?.scale || 1}${data?.warning ? ` warning=${truncateText(data.warning, 80)}` : ''}`;
    }
    default:
      return `${result.tool}: ok`;
  }
}

function sanitizeToolResult(result: ToolResult): ToolResult {
  if (result.tool !== 'screenshotPage' || !result.ok) {
    return result;
  }

  const data = result.data as ScreenshotResultData | undefined;
  if (!data?.dataUrl) {
    return result;
  }

  return {
    ...result,
    data: {
      ...data,
      dataUrl: `[image omitted, ${Math.round(data.dataUrl.length / 1024)} KB]`,
    },
  };
}

function toImageContent(data: ScreenshotResultData) {
  const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('截图结果不是有效的 base64 data URL');
  }

  return {
    type: 'image' as const,
    data: match[2],
    mimeType: data.mimeType || match[1],
  };
}

function modelSupportsImageInput(model: Model<any>) {
  return Array.isArray((model as any)?.input) && (model as any).input.includes('image');
}

async function executeBrowserTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  const result = await executeToolInContent(call, signal);
  if (!result.ok) {
    throw new Error(result.error || `工具执行失败: ${call.tool}`);
  }
  return result;
}

function createTool(
  name: ToolCall['tool'],
  label: string,
  description: string,
  parameters: AgentTool['parameters'],
  options?: {
    multimodal?: boolean;
    getDefaultArgs?: () => Record<string, any> | undefined;
  }
) : AgentTool {
  return {
    name,
    label,
    description,
    parameters,
    execute: async (_toolCallId: string, params: unknown, signal?: AbortSignal) => {
      const normalizedArgs =
        params && typeof params === 'object' && !Array.isArray(params)
          ? (params as Record<string, any>)
          : {};
      const mergedArgs = {
        ...(options?.getDefaultArgs?.() || {}),
        ...normalizedArgs,
      };
      const args = Object.keys(mergedArgs).length > 0 ? mergedArgs : undefined;
      const result = await executeBrowserTool({ tool: name, args }, signal);
      const content =
        options?.multimodal && result.ok
          ? [
              { type: 'text' as const, text: summarizeToolResult(result) },
              toImageContent(result.data as ScreenshotResultData),
            ]
          : [{ type: 'text' as const, text: summarizeToolResult(result) }];
      return {
        content,
        details: sanitizeToolResult(result),
      };
    },
  };
}

function createBrowserAgentTools(
  allowScreenshots: boolean,
  getSelectedScreenshotTarget?: () => SelectedScreenshotTarget | null
): AgentTool[] {
  return [
    createTool('getPageInfo', 'Get Page Info', '获取当前页面的 URL 和标题', Type.Object({})),
    createTool(
      'query',
      'Query Elements',
      '用 CSS 或 XPath 查询页面元素，返回候选 elementId',
      Type.Object({
        selector: Type.String({ description: 'CSS 选择器或 XPath 表达式' }),
        selectorType: Type.Optional(Type.Union([Type.Literal('css'), Type.Literal('xpath')])),
      })
    ),
    createTool(
      'findByText',
      'Find By Text',
      '按可见文本查找页面元素。查字段时可传 role="field"，会优先匹配 label、placeholder、name 和附近文本',
      Type.Object({
        text: Type.String({ description: '要查找的文本内容' }),
        role: Type.Optional(
          Type.Union([Type.Literal('button'), Type.Literal('link'), Type.Literal('field')])
        ),
      })
    ),
    createTool(
      'inspectElement',
      'Inspect Element',
      '读取元素的标签、状态、值和附近文本。可直接用 targetText 按字段标签定位',
      Type.Object({
        elementId: Type.Optional(Type.String()),
        selector: Type.Optional(Type.String()),
        selectorType: Type.Optional(Type.Union([Type.Literal('css'), Type.Literal('xpath')])),
        targetText: Type.Optional(Type.String()),
        targetRole: Type.Optional(
          Type.Union([Type.Literal('field'), Type.Literal('button'), Type.Literal('link')])
        ),
      })
    ),
    createTool(
      'getValue',
      'Get Value',
      '读取元素值、文本或指定属性。可直接用 targetText 按字段标签定位',
      Type.Object({
        elementId: Type.Optional(Type.String()),
        selector: Type.Optional(Type.String()),
        selectorType: Type.Optional(Type.Union([Type.Literal('css'), Type.Literal('xpath')])),
        targetText: Type.Optional(Type.String()),
        targetRole: Type.Optional(
          Type.Union([Type.Literal('field'), Type.Literal('button'), Type.Literal('link')])
        ),
        attribute: Type.Optional(Type.String()),
      })
    ),
    createTool(
      'interact',
      'Interact',
      '执行单个低风险动作：click、type、press、selectOption。常见表单可直接用 targetText 按字段标签定位',
      Type.Object({
        action: Type.Union([
          Type.Literal('click'),
          Type.Literal('type'),
          Type.Literal('press'),
          Type.Literal('selectOption'),
        ]),
        elementId: Type.Optional(Type.String()),
        selector: Type.Optional(Type.String()),
        selectorType: Type.Optional(Type.Union([Type.Literal('css'), Type.Literal('xpath')])),
        targetText: Type.Optional(Type.String()),
        targetRole: Type.Optional(
          Type.Union([Type.Literal('field'), Type.Literal('button'), Type.Literal('link')])
        ),
        text: Type.Optional(Type.String()),
        key: Type.Optional(Type.String()),
        value: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        mode: Type.Optional(Type.Union([Type.Literal('replace'), Type.Literal('append')])),
      })
    ),
    createTool(
      'waitFor',
      'Wait For',
      '等待元素、文本或页面状态稳定',
      Type.Object({
        selector: Type.Optional(Type.String()),
        selectorType: Type.Optional(Type.Union([Type.Literal('css'), Type.Literal('xpath')])),
        text: Type.Optional(Type.String()),
        state: Type.Optional(
          Type.Union([Type.Literal('appear'), Type.Literal('disappear'), Type.Literal('stable')])
        ),
        timeoutMs: Type.Optional(Type.Number()),
      })
    ),
    ...(allowScreenshots
      ? [
          createTool(
            'screenshotPage',
            'Screenshot Page',
            '截图当前页面或用户已选中的目标元素。默认 fullpage，适合把页面视觉内容作为图片提供给模型',
            Type.Object({
              mode: Type.Optional(Type.Union([Type.Literal('fullpage'), Type.Literal('viewport')])),
              target: Type.Optional(Type.Union([Type.Literal('page'), Type.Literal('element')])),
              elementId: Type.Optional(Type.String()),
            }),
            {
              multimodal: true,
              getDefaultArgs: () => {
                const selectedTarget = getSelectedScreenshotTarget?.();
                if (!selectedTarget) {
                  return undefined;
                }
                return {
                  target: 'element',
                  elementId: selectedTarget.elementId,
                };
              },
            }
          ),
        ]
      : []),
  ];
}

export function getBrowserAgentConfigKey(config: AIConfig) {
  return JSON.stringify({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    customEndpoint: config.customEndpoint,
    topP: config.topP,
    repetitionPenalty: config.repetitionPenalty,
    mode: 'browser-agent',
  });
}

export function extractAssistantText(message: any): string {
  if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) {
    return '';
  }

  return message.content
    .filter((item: any) => item?.type === 'text')
    .map((item: any) => item.text || '')
    .join('');
}

function pruneMessages(messages: any[]) {
  return messages.length > 12 ? messages.slice(-12) : messages;
}

export function createBrowserAgent(
  config: AIConfig,
  getInjectedContext: () => string | null,
  previousMessages?: any[],
  getSelectedScreenshotTarget?: () => SelectedScreenshotTarget | null
) {
  const model = createModelFromConfig(config);
  return new Agent({
    initialState: {
      systemPrompt: BROWSER_AGENT_SYSTEM_PROMPT,
      model,
      tools: createBrowserAgentTools(modelSupportsImageInput(model), getSelectedScreenshotTarget),
      messages: pruneMessages(previousMessages || []),
    },
    transformContext: async (messages) => {
      const pruned = pruneMessages(messages);
      const contextText = getInjectedContext();
      if (!contextText?.trim()) {
        return pruned;
      }

      return [
        {
          role: 'user' as const,
          content: `当前页面抓取内容（仅供当前轮参考，优先局部读取，不要大段复述）：\n\n${truncateText(contextText.trim())}`,
          timestamp: Date.now(),
        },
        ...pruned,
      ];
    },
    toolExecution: 'sequential',
    getApiKey: () => config.apiKey || undefined,
    onPayload: async (payload) => {
      if (!payload || typeof payload !== 'object') {
        return payload;
      }

      const nextPayload = { ...(payload as Record<string, unknown>) };
      if (config.topP !== undefined) {
        nextPayload.top_p = config.topP;
      }
      if (config.repetitionPenalty !== undefined) {
        nextPayload.repetition_penalty = config.repetitionPenalty;
      }
      return nextPayload;
    },
  });
}
