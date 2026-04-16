import {
  CONTINUITY_SUMMARY_MAX_TOKENS,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_INPUT_TOKEN_THRESHOLD,
  DEFAULT_RECENT_RAW_MESSAGE_COUNT,
  DEFAULT_RECENT_TOOL_RESULT_COUNT,
  DEFAULT_TOKEN_SAFETY_MARGIN,
} from '@/shared/constants';
import type { AIConfig, ChatMessage, PageContext } from '@/shared/types';
import {
  buildStagedMemory,
  getOrCreateFormattedPageContext,
  summarizeToolLogs,
  type MemoryEntry,
  type PageSummaryCacheEntry,
  type ToolLogSummaryEntry,
} from './context-memory';

export interface ContinuitySummaryState {
  summary: string;
  coveredMessageCount: number;
  summaryId: string;
  timestamp: number;
}

export interface CompressionPinnedMemory {
  latestUserInput?: string;
  latestExecutionOutcome?: string;
}

export interface CompressionBuildInput {
  messages: ChatMessage[];
  pageContext?: PageContext;
  pageSummaryCache?: Map<string, PageSummaryCacheEntry>;
  buildMemoryEntries: (messages: ChatMessage[]) => MemoryEntry[];
  buildToolEntries: (messages: ChatMessage[]) => ToolLogSummaryEntry[];
  continuity?: ContinuitySummaryState | null;
  pinnedMemory?: CompressionPinnedMemory;
}

export interface CompressionBuildResult {
  messages: ChatMessage[];
  estimatedTokens: number;
  needsContinuitySummary: boolean;
  pageSummary?: string;
}

function cleanSystemContent(content: string | null | undefined) {
  return typeof content === 'string' ? content.trim() : '';
}

function dedupeSystemMessages(messages: ChatMessage[]) {
  const seen = new Set<string>();
  const result: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role !== 'system') {
      result.push(message);
      continue;
    }

    const content = cleanSystemContent(message.content);
    if (!content) {
      continue;
    }

    if (seen.has(content)) {
      continue;
    }

    seen.add(content);
    result.push({
      ...message,
      content,
    });
  }

  return result;
}

function compactToolMessages(messages: ChatMessage[]) {
  const toolIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'tool');

  if (toolIndexes.length <= DEFAULT_RECENT_TOOL_RESULT_COUNT) {
    return messages;
  }

  const keepIndexes = new Set(
    toolIndexes.slice(-DEFAULT_RECENT_TOOL_RESULT_COUNT).map(({ index }) => index)
  );

  return messages
    .map((message, index) => {
      if (message.role !== 'tool' || keepIndexes.has(index)) {
        return message;
      }

      return {
        ...message,
        content: `[旧工具结果已压缩] ${message.name || 'tool'}`,
      };
    })
    .filter((message) => message.content !== null);
}

function removeEmptyMessages(messages: ChatMessage[]) {
  return messages.filter((message) => {
    if (message.role === 'assistant' && message.tool_calls?.length) {
      return true;
    }
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    return Boolean(content);
  });
}

export function estimateTokens(messages: ChatMessage[]) {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

export function getContextWindow(_config: AIConfig) {
  return DEFAULT_CONTEXT_WINDOW;
}

export function getInputBudget(config: AIConfig) {
  const contextWindow = getContextWindow(config);
  const reservedOutputTokens = Math.min(config.maxTokens || 4096, Math.floor(contextWindow * 0.25));
  return Math.max(4096, contextWindow - reservedOutputTokens - DEFAULT_TOKEN_SAFETY_MARGIN);
}

export function buildContinuityReference(state: ContinuitySummaryState) {
  return [
    '[连续性摘要引用]',
    `summaryId: ${state.summaryId}`,
    `coveredMessageCount: ${state.coveredMessageCount}`,
    `timestamp: ${state.timestamp}`,
  ].join('\n');
}

export function buildContinuitySummaryPrompt(messages: ChatMessage[], pageSummary?: string) {
  const serialized = JSON.stringify(messages);
  const promptSections = [
    '请将以下历史对话压缩为结构化 continuity summary，供后续多轮对话续接使用。',
    '要求：',
    '1. 使用简洁中文',
    '2. 明确保留：当前目标、用户硬约束、已完成步骤、当前页面/环境状态、最近工具结果、最近失败与待解决问题',
    '3. 不要编造不存在的信息',
    '4. 输出纯文本，不要使用 Markdown 代码块',
  ];

  if (pageSummary?.trim()) {
    promptSections.push(`当前页面信息（完整保留，不需要重复展开）：\n${pageSummary.trim()}`);
  }

  promptSections.push(`历史消息（JSON）：\n${serialized}`);
  return promptSections.join('\n\n');
}

export function precompactMessages(messages: ChatMessage[]) {
  return removeEmptyMessages(dedupeSystemMessages(compactToolMessages(messages)));
}

function buildPinnedMessages(pinnedMemory?: CompressionPinnedMemory) {
  const messages: ChatMessage[] = [];

  if (pinnedMemory?.latestExecutionOutcome?.trim()) {
    messages.push({
      role: 'system',
      content: `[最近执行结果]\n${pinnedMemory.latestExecutionOutcome.trim()}`,
      timestamp: Date.now(),
    });
  }

  return messages;
}

function buildRecentWindow(messages: ChatMessage[]) {
  const recent = messages.slice(-DEFAULT_RECENT_RAW_MESSAGE_COUNT);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  if (!latestUserMessage) {
    return recent;
  }

  if (recent.some((message) => message === latestUserMessage)) {
    return recent;
  }

  return [...recent, latestUserMessage];
}

export function budgetCompactMessages(
  sourceMessages: ChatMessage[],
  config: AIConfig,
  input: Omit<CompressionBuildInput, 'messages'>
): CompressionBuildResult {
  const precompacted = precompactMessages(sourceMessages);
  const pinnedMessages = buildPinnedMessages(input.pinnedMemory);
  const pageSummary = input.pageContext && input.pageSummaryCache
    ? getOrCreateFormattedPageContext(input.pageSummaryCache, input.pageContext).formatted
    : undefined;

  const systemMessages: ChatMessage[] = [];

  if (pageSummary) {
    systemMessages.push({
      role: 'system',
      content: pageSummary,
      timestamp: Date.now(),
    });
  }

  if (input.continuity?.summary?.trim()) {
    systemMessages.push({
      role: 'system',
      content: `[连续性摘要]\n${input.continuity.summary.trim()}`,
      timestamp: input.continuity.timestamp,
    });
    systemMessages.push({
      role: 'system',
      content: buildContinuityReference(input.continuity),
      timestamp: input.continuity.timestamp,
    });
  }

  const budget = getInputBudget(config);
  const recentWindow = buildRecentWindow(precompacted);
  const memoryEntries = input.buildMemoryEntries(precompacted);
  const stagedMemory = buildStagedMemory(memoryEntries);
  const toolSummary = summarizeToolLogs(input.buildToolEntries(precompacted));

  const compressedMessages: ChatMessage[] = [...systemMessages, ...pinnedMessages];

  if (stagedMemory.longTermSummary) {
    compressedMessages.push({
      role: 'system',
      content: stagedMemory.longTermSummary,
      timestamp: Date.now(),
    });
  }

  if (stagedMemory.stageSummary) {
    compressedMessages.push({
      role: 'system',
      content: stagedMemory.stageSummary,
      timestamp: Date.now(),
    });
  }

  if (toolSummary) {
    compressedMessages.push({
      role: 'system',
      content: toolSummary,
      timestamp: Date.now(),
    });
  }

  compressedMessages.push(...recentWindow);

  const estimatedTokens = estimateTokens(compressedMessages);
  const overThreshold = estimatedTokens > Math.min(DEFAULT_INPUT_TOKEN_THRESHOLD, budget);

  return {
    messages: compressedMessages,
    estimatedTokens,
    needsContinuitySummary: overThreshold,
    pageSummary,
  };
}

export function continuityCompactMessages(
  sourceMessages: ChatMessage[],
  continuity: ContinuitySummaryState,
  input: Omit<CompressionBuildInput, 'messages' | 'continuity'>
) {
  return budgetCompactMessages(sourceMessages, {
    provider: 'custom',
    apiKey: '',
    model: 'continuity',
    maxTokens: CONTINUITY_SUMMARY_MAX_TOKENS,
  }, {
    ...input,
    continuity,
  });
}
