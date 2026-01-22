import { useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { Input } from '../shared/Input';

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function InputArea({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isLoading = false,
  placeholder = '输入您的问题...',
}: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [value]);

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (value.trim() && !disabled && !isLoading) {
      onSend();
    }
  };

  const handleStop = () => {
    if (onStop && isLoading) {
      onStop();
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-white">
      <div className="flex gap-2 items-end">
        <Input
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSend={handleSend}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          className="flex-1"
        />
        {isLoading ? (
          <button
            onClick={handleStop}
            className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex-shrink-0"
            title="中断"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="w-10 h-10 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
