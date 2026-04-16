import type { ChatMessage, PageContext } from '@/shared/types';
import { cleanText, normalizeStructuredText, truncateText } from '@/shared/utils/text-processor';

export interface ToolLogSummaryEntry {
  toolName: string;
  status: 'running' | 'success' | 'error';
  summary: string;
  intent?: string;
  resultText?: string;
}

export interface MemoryEntry {
  role: ChatMessage['role'];
  text: string;
  timestamp?: number;
}

export interface StagedMemoryResult {
  recentStartIndex: number;
  longTermSummary: string | null;
  stageSummary: string | null;
}

export interface PageSummaryCacheEntry {
  cacheKey: string;
  formatted: string;
}

const LONG_TERM_ITEM_LIMIT = 8;
const STAGE_ITEM_LIMIT = 6;
const RECENT_MESSAGE_LIMIT = 8;
const STAGE_MESSAGE_LIMIT = 6;

function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function formatMemoryLine(entry: MemoryEntry, maxLength = 180) {
  const roleLabel =
    entry.role === 'user'
      ? '用户'
      : entry.role === 'assistant'
        ? '助手'
        : entry.role === 'tool'
          ? '工具'
          : '系统';
  return `- ${roleLabel}: ${truncateText(cleanText(entry.text), maxLength)}`;
}

function buildSummaryBlock(title: string, entries: MemoryEntry[], maxItems: number) {
  if (!entries.length) {
    return null;
  }

  const clippedEntries = entries.slice(-maxItems);
  const omitted = Math.max(0, entries.length - clippedEntries.length);
  const lines = clippedEntries.map((entry) => formatMemoryLine(entry));
  if (omitted > 0) {
    lines.unshift(`- 另有 ${omitted} 条更早消息已折叠`);
  }
  return `${title}\n${lines.join('\n')}`;
}

export function buildStagedMemory(entries: MemoryEntry[]): StagedMemoryResult {
  if (entries.length <= RECENT_MESSAGE_LIMIT) {
    return {
      recentStartIndex: 0,
      longTermSummary: null,
      stageSummary: null,
    };
  }

  const recentStartIndex = Math.max(0, entries.length - RECENT_MESSAGE_LIMIT);
  const olderEntries = entries.slice(0, recentStartIndex);
  const stageStartIndex = Math.max(0, olderEntries.length - STAGE_MESSAGE_LIMIT);
  const longTermEntries = olderEntries.slice(0, stageStartIndex);
  const stageEntries = olderEntries.slice(stageStartIndex);

  return {
    recentStartIndex,
    longTermSummary: buildSummaryBlock('[长期记忆摘要]', longTermEntries, LONG_TERM_ITEM_LIMIT),
    stageSummary: buildSummaryBlock('[阶段记忆摘要]', stageEntries, STAGE_ITEM_LIMIT),
  };
}

export function summarizeToolLogs(toolLogs: ToolLogSummaryEntry[]): string | null {
  if (!toolLogs.length) {
    return null;
  }

  const lines = toolLogs.slice(-6).map((toolLog) => {
    const statusLabel =
      toolLog.status === 'error'
        ? '失败'
        : toolLog.status === 'running'
          ? '进行中'
          : '成功';
    const detail = toolLog.resultText || toolLog.summary || toolLog.intent || '';
    return `- ${toolLog.toolName} (${statusLabel}): ${truncateText(cleanText(detail), 180)}`;
  });

  return ['[工具结果摘要]', ...lines].join('\n');
}

export function getPageContextCacheKey(pageContext: PageContext): string {
  return `${pageContext.url}::${hashText(pageContext.content)}`;
}

export function formatPageContextForPrompt(pageContext: PageContext): string {
  const selectedText = normalizeStructuredText(pageContext.selectedText || '');
  const fullContent = normalizeStructuredText(pageContext.content);
  const metadataLines = [
    pageContext.metadata?.author ? `作者：${pageContext.metadata.author}` : '',
    pageContext.metadata?.publishDate ? `发布日期：${pageContext.metadata.publishDate}` : '',
    pageContext.metadata?.wordCount ? `字数：${pageContext.metadata.wordCount}` : '',
    pageContext.extraction?.strategy ? `提取策略：${pageContext.extraction.strategy}` : '',
    pageContext.extraction?.outputFormat ? `内容格式：${pageContext.extraction.outputFormat}` : '',
  ].filter(Boolean);

  const lines = [
    `[页面上下文]`,
    `标题：${pageContext.title || '未命名页面'}`,
    `URL：${pageContext.url}`,
    ...metadataLines,
  ];

  if (selectedText) {
    lines.push('选中文本：');
    lines.push(selectedText);
  }

  lines.push('页面全文：');
  lines.push(fullContent || '暂无可用内容');
  return lines.join('\n');
}

export function getOrCreateFormattedPageContext(
  cache: Map<string, PageSummaryCacheEntry>,
  pageContext: PageContext
): PageSummaryCacheEntry {
  const cacheKey = getPageContextCacheKey(pageContext);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const entry = {
    cacheKey,
    formatted: formatPageContextForPrompt(pageContext),
  };
  cache.set(cacheKey, entry);
  return entry;
}
