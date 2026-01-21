import { useState } from 'react';
import { FileText, Clock, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { PageContext } from '@/shared/types';

interface ContextPreviewProps {
  context: PageContext | null;
  isLoading?: boolean;
}

export function ContextPreview({ context, isLoading }: ContextPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            📄 当前页面
          </span>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="text-sm text-gray-400 text-center">
          暂无页面内容
        </div>
      </div>
    );
  }

  const { title, url, content, metadata } = context;
  if (typeof content !== 'string') {
    return (
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="text-sm text-gray-400 text-center">
          页面内容不可用（请切换到普通网页标签页后重试）
        </div>
      </div>
    );
  }
  const displayContent = isExpanded
    ? content
    : content.substring(0, 150) + (content.length > 150 ? '...' : '');

  return (
    <div className="p-4 bg-gray-50 border-b border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <FileText size={14} />
          当前页面
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-primary font-medium hover:text-primary-dark transition-colors flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              收起 <ChevronUp size={14} />
            </>
          ) : (
            <>
              展开 <ChevronDown size={14} />
            </>
          )}
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
        {title}
      </h3>

      {/* Content Preview */}
      <p className="text-xs text-gray-600 leading-relaxed mb-3">
        {displayContent}
      </p>

      {/* Metadata */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {metadata.wordCount && (
          <span className="flex items-center gap-1">
            <BookOpen size={12} />
            约 {metadata.wordCount} 字
          </span>
        )}
        {metadata.readingTime && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            阅读时间 {metadata.readingTime} 分钟
          </span>
        )}
      </div>

      {/* URL (when expanded) */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary-dark break-all"
          >
            {url}
          </a>
        </div>
      )}
    </div>
  );
}
