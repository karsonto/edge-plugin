/**
 * 已加载文件列表组件
 * 显示通过拖拽上传的文件，支持删除
 */

import { X, FileText, FileSpreadsheet, File } from 'lucide-react';
import type { ParsedFile } from '@/shared/utils/file-parser';
import { formatFileSize } from '@/shared/utils/file-parser';

interface FileListProps {
  files: ParsedFile[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

// 根据文件类型返回图标
function getFileIcon(type: string) {
  switch (type) {
    case 'pptx':
      return <FileSpreadsheet size={14} className="text-orange-500" />;
    case 'docx':
      return <FileText size={14} className="text-blue-500" />;
    case 'pdf':
      return <FileText size={14} className="text-red-500" />;
    case 'txt':
      return <File size={14} className="text-gray-500" />;
    default:
      return <File size={14} className="text-gray-500" />;
  }
}

export function FileList({ files, onRemove, onClear }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-blue-700">
          📎 已加载 {files.length} 个文件
        </span>
        <button
          onClick={onClear}
          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          清空全部
        </button>
      </div>
      
      <div className="flex flex-wrap gap-1.5">
        {files.map(file => (
          <div
            key={file.id}
            className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border border-blue-200 text-xs group"
            title={`${file.name}\n${formatFileSize(file.size)}${file.pageCount ? `\n${file.pageCount} 页` : ''}\n内容: ${file.content.slice(0, 100)}...`}
          >
            {getFileIcon(file.type)}
            <span className="text-gray-700 max-w-[120px] truncate">
              {file.name}
            </span>
            <button
              onClick={() => onRemove(file.id)}
              className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
