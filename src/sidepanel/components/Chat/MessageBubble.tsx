import { useMemo, useState } from 'react';
import { User, Bot, Maximize2, ChevronDown, ChevronRight, Wrench, AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { MarkdownContent } from './MarkdownContent';

interface MessageBubbleProps {
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
  onExpand?: (payload: { role: 'user' | 'assistant'; content: string }) => void;
}

function toPrettyJson(value: unknown) {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(
      value,
      (_key, current) => {
        if (typeof current === 'string') {
          return current.length > 4000 ? `${current.slice(0, 4000)}... [truncated]` : current;
        }
        if (current && typeof current === 'object') {
          if (seen.has(current as object)) return '[Circular]';
          seen.add(current as object);
        }
        return current;
      },
      2
    ) || '{}'
  );
}

function ToolLogCard({ toolLog }: { toolLog: NonNullable<MessageBubbleProps['toolLog']> }) {
  const [expanded, setExpanded] = useState(false);
  const detailsJson = useMemo(() => toPrettyJson(toolLog.details || {}), [toolLog.details]);
  const argsJson = useMemo(() => toPrettyJson(toolLog.args || {}), [toolLog.args]);
  const screenshotMeta =
    toolLog.toolName === 'screenshotPage' &&
    toolLog.details &&
    typeof toolLog.details === 'object' &&
    (toolLog.details as any)?.data
      ? (toolLog.details as any).data
      : null;

  const statusIcon =
    toolLog.status === 'running' ? (
      <LoaderCircle size={16} className="animate-spin text-blue-600" />
    ) : toolLog.status === 'error' ? (
      <AlertTriangle size={16} className="text-red-600" />
    ) : (
      <CheckCircle2 size={16} className="text-green-600" />
    );

  const statusText =
    toolLog.status === 'running'
      ? '执行中'
      : toolLog.status === 'error'
        ? '执行失败'
        : '执行完成';

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="mt-0.5 flex-shrink-0">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
        <div className="mt-0.5 flex-shrink-0">
          <Wrench size={16} className="text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900">{toolLog.toolName}</span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              {statusIcon}
              {statusText}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-700">{toolLog.summary}</div>
          {toolLog.intent && <div className="mt-1 text-xs text-gray-500">{toolLog.intent}</div>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">参数</div>
            <pre className="text-xs overflow-x-auto rounded-md bg-gray-900 text-gray-100 p-3">{argsJson}</pre>
          </div>

          {toolLog.resultText && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">
                {toolLog.status === 'error' ? '错误原因' : '结果摘要'}
              </div>
              <div
                className={clsx(
                  'text-sm rounded-md px-3 py-2 whitespace-pre-wrap',
                  toolLog.status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-gray-800 border border-gray-200'
                )}
              >
                {toolLog.resultText}
              </div>
            </div>
          )}

          {screenshotMeta && (
            <div className="rounded-md border border-dashed border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              已生成截图占位信息：{screenshotMeta.width}x{screenshotMeta.height}
              {typeof screenshotMeta.tileCount === 'number' ? `，分片 ${screenshotMeta.tileCount}` : ''}
              {screenshotMeta.mode ? `，模式 ${screenshotMeta.mode}` : ''}
              {screenshotMeta.targetType ? `，目标 ${screenshotMeta.targetType}` : ''}
              {screenshotMeta.targetInfo?.tag ? `，标签 ${screenshotMeta.targetInfo.tag}` : ''}
              {screenshotMeta.targetInfo?.selectorHint ? `，定位 ${screenshotMeta.targetInfo.selectorHint}` : ''}
              {screenshotMeta.targetInfo?.ownerIframeInfo
                ? `，所属 iframe ${screenshotMeta.targetInfo.ownerIframeInfo.name || screenshotMeta.targetInfo.ownerIframeInfo.src || screenshotMeta.targetInfo.ownerIframeInfo.selectorHint || screenshotMeta.targetInfo.ownerIframeInfo.elementId}`
                : ''}
              {screenshotMeta.warning ? `，提示：${screenshotMeta.warning}` : ''}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">完整详情</div>
            <pre className="text-xs overflow-x-auto rounded-md bg-gray-900 text-gray-100 p-3">{detailsJson}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ role, content, timestamp, isStreaming, kind, toolLog, onExpand }: MessageBubbleProps) {
  const time = new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex gap-3 animate-slide-in">
      {/* Avatar */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          role === 'user'
            ? 'bg-gradient-to-br from-purple-500 to-purple-700'
            : 'bg-gradient-to-br from-primary to-primary-dark'
        )}
      >
        {role === 'user' ? (
          <User size={18} className="text-white" />
        ) : (
          <Bot size={18} className="text-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="relative">
          <div
            className={clsx(
              'px-4 py-3 rounded-xl break-words',
              role === 'user'
                ? 'bg-primary text-white whitespace-pre-wrap'
                : 'bg-gray-100 text-gray-900'
            )}
          >
            {/* 用户消息：纯文本 */}
            {role === 'user' ? (
              <>
                {content}
                {isStreaming && (
                  <span className="inline-block w-1 h-4 ml-1 bg-current animate-pulse" />
                )}
              </>
            ) : kind === 'tool_log' && toolLog ? (
              <ToolLogCard toolLog={toolLog} />
            ) : (
              // AI 消息：Markdown 渲染
              <div className="markdown-content">
                <MarkdownContent content={content} />
                {isStreaming && (
                  <span className="inline-block w-1 h-4 ml-1 bg-gray-700 animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Expand (assistant messages only) */}
          {role === 'assistant' && kind !== 'tool_log' && !isStreaming && !!onExpand && (
            <button
              className="absolute -top-2 -right-2 p-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
              onClick={() => onExpand?.({ role, content })}
              aria-label="Expand"
              title="放大查看"
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1 px-1">{time}</div>
      </div>
    </div>
  );
}
