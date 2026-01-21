import { User, Bot } from 'lucide-react';
import { clsx } from 'clsx';
import { MarkdownContent } from './MarkdownContent';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export function MessageBubble({ role, content, timestamp, isStreaming }: MessageBubbleProps) {
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
        <div className="text-xs text-gray-400 mt-1 px-1">{time}</div>
      </div>
    </div>
  );
}
