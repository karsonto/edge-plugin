import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import {
  Type,
  type AssistantMessage,
  type ImageContent,
  type Message as PiMessage,
  type Model,
  type TextContent,
  type ThinkingContent,
  type ToolCall as PiToolCall,
  type ToolResultMessage,
  type UserMessage,
  type Usage,
} from '@mariozechner/pi-ai';
import type {
  AriaInspectResultData,
  AriaInteractResultData,
  AriaTreeResultData,
  AIConfig,
  ChatMessage,
  ElementSummary,
  InspectElementData,
  InteractResultData,
  SelectedScreenshotTarget,
  ScreenshotResultData,
  ToolCall,
  ToolResult,
  ResolveAriaRefData,
  WaitForResultData,
  WaitForAriaResultData,
} from '@/shared/types';
import {
  budgetCompactMessages,
  getOpenAICompatibleEndpoint,
  toOpenAICompatibleBaseUrl,
  type ContinuitySummaryState,
  type MemoryEntry,
  type ToolLogSummaryEntry,
} from '@/shared/ai';
import { DEFAULT_RECENT_RAW_MESSAGE_COUNT } from '@/shared/constants';
import { createMessage, generateMessageId, sendToBackground, truncateText } from '@/shared/utils';
import { executeToolInContent } from './content-tool-bridge';

const BASE_AGENT_SYSTEM_PROMPT = `你是网页智能助手。
要求：
1. 基于已有对话、系统消息和可选的页面摘要回答问题
2. 如果没有足够信息，明确说明缺失信息，不要假装已经读取页面或执行过操作
3. 回答保持简洁、准确、自然，优先直接给出结论
4. 如果工具不可用，就只基于现有上下文回答，不要虚构工具结果`;

const BROWSER_TOOL_SYSTEM_PROMPT = `当前已启用浏览器页面工具。你可以读取页面并完成低风险网页操作。
规则：
1. 默认先读取 ARIA 语义树，再操作
2. 优先使用 readAriaTree 获取 ref，再使用 ariaInspect / ariaInteract / waitForAria
3. 对常见表单字段，优先通过 aria ref 定位；只有 ref 不足时再退回 findByText/query
4. 动作后必须验证结果，优先使用 ariaInspect、waitForAria 或局部 readAriaTree(ref)
5. 当需要视觉确认布局、图表、颜色、截图证据，或遇到跨域 iframe 时，使用 screenshotPage
6. 旧的 findByText/query/getValue/inspectElement/interact/waitFor 是回退工具，不是主路径
7. 一次只执行一个动作工具
8. 不要重复读取整页，优先做局部子树检查
9. 连续失败或无法确认页面状态时，停止并请求用户澄清
10. 完成任务后，用简洁自然语言汇报结果`;

function buildAgentSystemPrompt(enableTools: boolean) {
  return enableTools
    ? `${BASE_AGENT_SYSTEM_PROMPT}\n\n${BROWSER_TOOL_SYSTEM_PROMPT}`
    : BASE_AGENT_SYSTEM_PROMPT;
}

function createOpenAICompatibleModel(config: AIConfig): Model<'openai-completions'> {
  const endpoint = getOpenAICompatibleEndpoint(config);

  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: config.provider === 'custom' ? 'custom' : 'openai',
    baseUrl: toOpenAICompatibleBaseUrl(endpoint),
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
  return createOpenAICompatibleModel(config);
}

function summarizeElement(element?: ElementSummary) {
  if (!element) return 'unknown element';
  const pieces = [element.tag, element.labelText, element.text, element.placeholder].filter(Boolean);
  return pieces.join(' | ') || element.id;
}

function extractMessageText(message: any): string {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return '';
  }

  return message.content
    .map((item: any) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item?.type === 'text') {
        return item.text || '';
      }
      if (item?.type === 'thinking') {
        return item.thinking || '';
      }
      if (item?.type === 'tool_result') {
        if (typeof item.content === 'string') {
          return item.content;
        }
        if (Array.isArray(item.content)) {
          return item.content
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .join('\n');
        }
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

interface BrowserAgentSystemMessage {
  role: 'system';
  content: string;
  timestamp: number;
}

type BrowserAgentContextMessage = PiMessage | BrowserAgentSystemMessage;

function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function toTextContent(text: string): TextContent[] {
  const normalized = text.trim();
  return normalized ? [{ type: 'text', text: normalized }] : [];
}

function normalizeUserContent(content: unknown): UserMessage['content'] {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return extractMessageText({ content });
  }

  const normalized: UserMessage['content'] = content.flatMap((item: any): Array<TextContent | ImageContent> => {
    if (typeof item === 'string') {
      return toTextContent(item);
    }
    if (item?.type === 'text' && typeof item.text === 'string') {
      return [{ type: 'text' as const, text: item.text }];
    }
    if (item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') {
      return [{
        type: 'image' as const,
        data: item.data,
        mimeType: item.mimeType,
      }];
    }
    return [];
  });

  return normalized.length > 0 ? normalized : extractMessageText({ content });
}

function normalizeAssistantContent(content: unknown): AssistantMessage['content'] {
  if (!Array.isArray(content)) {
    return toTextContent(extractMessageText({ content }));
  }

  return content.flatMap((item: any): Array<TextContent | ThinkingContent | PiToolCall> => {
    if (typeof item === 'string') {
      return toTextContent(item);
    }
    if (item?.type === 'text' && typeof item.text === 'string') {
      return [{
        type: 'text' as const,
        text: item.text,
        ...(typeof item.textSignature === 'string' ? { textSignature: item.textSignature } : {}),
      }];
    }
    if (item?.type === 'thinking') {
      const thinking = typeof item.thinking === 'string' ? item.thinking : '';
      if (!thinking && !item?.thinkingSignature) {
        return [];
      }
      return [{
        type: 'thinking' as const,
        thinking,
        ...(typeof item.thinkingSignature === 'string'
          ? { thinkingSignature: item.thinkingSignature }
          : {}),
        ...(item?.redacted ? { redacted: true } : {}),
      }];
    }
    if (
      item?.type === 'toolCall' &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      item.arguments &&
      typeof item.arguments === 'object' &&
      !Array.isArray(item.arguments)
    ) {
      return [{
        type: 'toolCall' as const,
        id: item.id,
        name: item.name,
        arguments: item.arguments,
        ...(typeof item.thoughtSignature === 'string'
          ? { thoughtSignature: item.thoughtSignature }
          : {}),
      }];
    }
    return [];
  });
}

function normalizeToolResultContent(content: unknown): ToolResultMessage['content'] {
  if (!Array.isArray(content)) {
    return toTextContent(extractMessageText({ content }));
  }

  return content.flatMap((item: any): Array<TextContent | ImageContent> => {
    if (typeof item === 'string') {
      return toTextContent(item);
    }
    if (item?.type === 'text' && typeof item.text === 'string') {
      return [{ type: 'text' as const, text: item.text }];
    }
    if (item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') {
      return [{
        type: 'image' as const,
        data: item.data,
        mimeType: item.mimeType,
      }];
    }
    return [];
  });
}

function normalizeReplayMessage(message: any, config: AIConfig): BrowserAgentContextMessage | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  if (message.role === 'system') {
    const content = extractMessageText(message).trim();
    if (!content) {
      return null;
    }
    return {
      role: 'system',
      content,
      timestamp: message.timestamp || Date.now(),
    };
  }

  if (message.role === 'user') {
    return {
      role: 'user',
      content: normalizeUserContent(message.content),
      timestamp: message.timestamp || Date.now(),
    };
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: normalizeAssistantContent(message.content),
      api: message.api || 'openai-completions',
      provider: message.provider || (config.provider === 'custom' ? 'custom' : 'openai'),
      model: message.model || config.model,
      responseId: message.responseId,
      usage: message.usage || createEmptyUsage(),
      stopReason: message.stopReason || 'stop',
      errorMessage: message.errorMessage,
      timestamp: message.timestamp || Date.now(),
    };
  }

  if (message.role === 'toolResult') {
    return {
      role: 'toolResult',
      toolCallId: message.toolCallId || message.tool_call_id || message.id || generateMessageId(),
      toolName: message.toolName || message.name || 'tool',
      content: normalizeToolResultContent(message.content),
      details: message.details,
      isError: Boolean(message.isError),
      timestamp: message.timestamp || Date.now(),
    };
  }

  if (message.role === 'tool') {
    const content = extractMessageText(message).trim();
    if (!content) {
      return null;
    }
    return {
      role: 'system',
      content: `[历史工具结果]\n${message.name || 'tool'}: ${content}`,
      timestamp: message.timestamp || Date.now(),
    };
  }

  return null;
}

function normalizeReplayMessages(messages: any[], config: AIConfig): BrowserAgentContextMessage[] {
  return messages
    .map((message) => normalizeReplayMessage(message, config))
    .filter((message): message is BrowserAgentContextMessage => Boolean(message));
}

function toCompressionMessages(messages: BrowserAgentContextMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.role === 'toolResult') {
      return {
        role: 'tool',
        content: extractMessageText(message),
        timestamp: message.timestamp,
        name: message.toolName,
        tool_call_id: message.toolCallId,
      };
    }

    return {
      role: message.role,
      content: message.role === 'user'
        ? (typeof message.content === 'string' ? message.content : extractMessageText(message))
        : extractMessageText(message),
      timestamp: message.timestamp,
    };
  });
}

function buildRecentReplayWindow(messages: BrowserAgentContextMessage[]) {
  const replayableMessages = messages.filter((message) => message.role !== 'system');
  const recent = replayableMessages.slice(-DEFAULT_RECENT_RAW_MESSAGE_COUNT);
  const latestUserMessage = [...replayableMessages].reverse().find((message) => message.role === 'user');

  if (!latestUserMessage) {
    return recent;
  }

  if (recent.includes(latestUserMessage)) {
    return recent;
  }

  return [...recent, latestUserMessage];
}

function toSystemContextMessages(messages: ChatMessage[]): BrowserAgentSystemMessage[] {
  return messages
    .filter((message) => message.role === 'system' && typeof message.content === 'string' && message.content.trim())
    .map((message) => ({
      role: 'system' as const,
      content: message.content!.trim(),
      timestamp: message.timestamp || Date.now(),
    }));
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
    case 'readAriaTree': {
      const data = result.data as AriaTreeResultData | undefined;
      return `readAriaTree: nodes=${data?.nodeCount || 0} refs=${data?.refCount || 0} filter=${data?.filter || 'all'} sparse=${data?.sparse ? 'yes' : 'no'}${data?.warnings?.length ? ` warning=${truncateText(data.warnings.join('; '), 120)}` : ''}`;
    }
    case 'resolveAriaRef': {
      const data = result.data as ResolveAriaRefData | undefined;
      return `resolveAriaRef: ${data?.ref || 'unknown'} found=${data?.found ? 'yes' : 'no'}${data?.node ? ` -> ${data.node.role} ${truncateText(data.node.name || data.node.text || '', 60)}` : ''}`;
    }
    case 'ariaInspect': {
      const data = result.data as AriaInspectResultData | undefined;
      return `ariaInspect: ${data?.node?.ref || ''} ${data?.node?.role || ''} ${truncateText(data?.node?.name || data?.node?.text || '', 60)}${data?.nearbyText ? ` nearby=${truncateText(data.nearbyText, 60)}` : ''}`;
    }
    case 'ariaInteract': {
      const data = result.data as AriaInteractResultData | undefined;
      return `ariaInteract: ${data?.action} ${data?.target?.ref || ''} ${data?.target?.role || ''} success=${data?.success ? 'yes' : 'no'}${data?.valuePreview ? ` value=${truncateText(data.valuePreview, 60)}` : ''}${data?.reloadSuggested ? ' reloadSuggested=yes' : ''}`;
    }
    case 'waitForAria': {
      const data = result.data as WaitForAriaResultData | undefined;
      return `waitForAria: matched=${data?.matched ? 'yes' : 'no'} elapsed=${data?.elapsedMs || 0}ms condition=${data?.condition || ''}${data?.matchedRef ? ` ref=${data.matchedRef}` : ''}`;
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

function buildToolContent(result: ToolResult, multimodal?: boolean) {
  if (multimodal && result.ok) {
    return [
      { type: 'text' as const, text: summarizeToolResult(result) },
      toImageContent(result.data as ScreenshotResultData),
    ];
  }

  if (result.tool === 'readAriaTree' && result.ok) {
    const data = result.data as AriaTreeResultData | undefined;
    const summary = summarizeToolResult(result);
    const tree = (data?.tree || '').trim();
    const hints = [
      'ARIA tree:',
      tree || '[empty tree]',
      '',
      'Use the full ref value exactly as shown, for example `aria_1`.',
      'Do not shorten, renumber, or strip the `aria_` prefix.',
    ].join('\n');
    return [{ type: 'text' as const, text: `${summary}\n\n${hints}` }];
  }

  return [{ type: 'text' as const, text: summarizeToolResult(result) }];
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
      const content = buildToolContent(result, options?.multimodal);
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
      'readAriaTree',
      'Read Aria Tree',
      '读取页面或局部子树的 ARIA 语义树，返回 ref 供后续交互使用',
      Type.Object({
        filter: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('interactive')])),
        depth: Type.Optional(Type.Number()),
        ref: Type.Optional(Type.String()),
      })
    ),
    createTool(
      'resolveAriaRef',
      'Resolve Aria Ref',
      '校验 ref 是否仍有效，并返回 ref 对应的语义节点摘要',
      Type.Object({
        ref: Type.String(),
      })
    ),
    createTool(
      'ariaInspect',
      'Inspect Aria Node',
      '读取指定 ref 节点的 role、name、状态、值和附近语义上下文',
      Type.Object({
        ref: Type.String(),
      })
    ),
    createTool(
      'ariaInteract',
      'Interact By Aria Ref',
      '基于 ARIA ref 执行单个低风险动作：click、type、press、selectOption',
      Type.Object({
        ref: Type.String(),
        action: Type.Union([
          Type.Literal('click'),
          Type.Literal('type'),
          Type.Literal('press'),
          Type.Literal('selectOption'),
        ]),
        text: Type.Optional(Type.String()),
        key: Type.Optional(Type.String()),
        value: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        mode: Type.Optional(Type.Union([Type.Literal('replace'), Type.Literal('append')])),
      })
    ),
    createTool(
      'waitForAria',
      'Wait For Aria',
      '等待指定 ref 或 aria 条件出现、消失或稳定',
      Type.Object({
        ref: Type.Optional(Type.String()),
        name: Type.Optional(Type.String()),
        role: Type.Optional(Type.String()),
        state: Type.Optional(
          Type.Union([Type.Literal('appear'), Type.Literal('disappear'), Type.Literal('stable')])
        ),
        timeoutMs: Type.Optional(Type.Number()),
      })
    ),
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
    enableTools: Boolean(config.enableFunctionCalling),
    mode: 'browser-agent',
  });
}

interface CreateBrowserAgentOptions {
  enableTools?: boolean;
  getSelectedScreenshotTarget?: () => SelectedScreenshotTarget | null;
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

function buildAgentMemoryEntries(messages: any[]): MemoryEntry[] {
  return messages
    .map((message) => ({
      role: message.role,
      text: extractMessageText(message),
      timestamp: message.timestamp,
    }))
    .filter((entry) => entry.text.trim());
}

function buildAgentToolEntries(messages: any[]): ToolLogSummaryEntry[] {
  return messages
    .filter((message) => message?.role === 'tool')
    .map((message) => ({
      toolName: message.name || 'tool',
      status: 'success' as const,
      summary: extractMessageText(message),
      resultText: extractMessageText(message),
    }))
    .filter((entry) => entry.summary.trim());
}

function buildInitialAgentMessages(
  messages: any[],
  config: AIConfig,
  getInjectedContext: () => string | null
) {
  const replayMessages = normalizeReplayMessages(messages, config);
  const compressionMessages = toCompressionMessages(replayMessages);
  const latestToolMessage = [...compressionMessages].reverse().find((message) => message.role === 'tool');
  const pageSummary = getInjectedContext()?.trim();

  const firstPass = budgetCompactMessages(compressionMessages, config, {
    buildMemoryEntries: (chatMessages) => buildAgentMemoryEntries(chatMessages),
    buildToolEntries: (chatMessages) => buildAgentToolEntries(chatMessages),
    continuity: null,
    pinnedMemory: {
      latestUserInput: [...compressionMessages].reverse().find((message) => message.role === 'user')?.content || undefined,
      latestExecutionOutcome: latestToolMessage?.content || undefined,
    },
  });

  const summaryMessages = toSystemContextMessages(firstPass.messages);
  const recentReplayMessages = buildRecentReplayWindow(replayMessages);
  const result: BrowserAgentContextMessage[] = [];

  if (pageSummary) {
    result.push({
      role: 'system',
      content: pageSummary,
      timestamp: Date.now(),
    });
  }

  result.push(...summaryMessages, ...recentReplayMessages);
  return result;
}

async function pruneMessages(
  messages: any[],
  config: AIConfig,
  getInjectedContext: () => string | null,
  continuitySummaryState: ContinuitySummaryState | null
) {
  const replayMessages = normalizeReplayMessages(messages, config);
  const compressionMessages = toCompressionMessages(replayMessages);
  const latestToolMessage = [...compressionMessages].reverse().find((message) => message.role === 'tool');
  const pageSummary = getInjectedContext()?.trim();

  const firstPass = budgetCompactMessages(compressionMessages, config, {
    buildMemoryEntries: (chatMessages) => buildAgentMemoryEntries(chatMessages),
    buildToolEntries: (chatMessages) => buildAgentToolEntries(chatMessages),
    continuity: continuitySummaryState,
    pinnedMemory: {
      latestUserInput: [...compressionMessages].reverse().find((message) => message.role === 'user')?.content || undefined,
      latestExecutionOutcome: latestToolMessage?.content || undefined,
    },
  });

  if (!firstPass.needsContinuitySummary) {
    const result: BrowserAgentContextMessage[] = [];
    if (pageSummary) {
      result.push({
        role: 'system',
        content: pageSummary,
        timestamp: Date.now(),
      });
    }
    result.push(...toSystemContextMessages(firstPass.messages), ...buildRecentReplayWindow(replayMessages));
    return { messages: result, continuity: continuitySummaryState };
  }

  const continuityResponse: any = await sendToBackground(
    createMessage('GENERATE_CONTINUITY_SUMMARY', {
      messages: compressionMessages,
      settings: config,
      pageSummary,
    })
  );

  const summary = continuityResponse?.payload?.summary?.trim();
  const nextContinuity = summary
    ? {
        summary,
        coveredMessageCount: compressionMessages.length,
        summaryId: generateMessageId(),
        timestamp: Date.now(),
      }
    : continuitySummaryState;

  const secondPass = budgetCompactMessages(compressionMessages, config, {
    buildMemoryEntries: (chatMessages) => buildAgentMemoryEntries(chatMessages),
    buildToolEntries: (chatMessages) => buildAgentToolEntries(chatMessages),
    continuity: nextContinuity,
    pinnedMemory: {
      latestUserInput: [...compressionMessages].reverse().find((message) => message.role === 'user')?.content || undefined,
      latestExecutionOutcome: latestToolMessage?.content || undefined,
    },
  });

  const result: BrowserAgentContextMessage[] = [];
  if (pageSummary) {
    result.push({
      role: 'system',
      content: pageSummary,
      timestamp: Date.now(),
    });
  }
  result.push(...toSystemContextMessages(secondPass.messages), ...buildRecentReplayWindow(replayMessages));
  return { messages: result, continuity: nextContinuity };
}

export function createBrowserAgent(
  config: AIConfig,
  getInjectedContext: () => string | null,
  previousMessages?: any[],
  options?: CreateBrowserAgentOptions
) {
  const model = createModelFromConfig(config);
  const enableTools = options?.enableTools ?? Boolean(config.enableFunctionCalling);
  let continuitySummaryState: ContinuitySummaryState | null = null;
  return new Agent({
    initialState: {
      systemPrompt: buildAgentSystemPrompt(enableTools),
      model,
      tools: enableTools
        ? createBrowserAgentTools(
            modelSupportsImageInput(model),
            options?.getSelectedScreenshotTarget
          )
        : [],
      messages: buildInitialAgentMessages(previousMessages || [], config, getInjectedContext) as any,
    },
    transformContext: async (messages) => {
      const result = await pruneMessages(messages, config, getInjectedContext, continuitySummaryState);
      continuitySummaryState = result.continuity;
      return result.messages as any;
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
