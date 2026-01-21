import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { InputArea } from './InputArea';
import { Bot } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  error?: string | null;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 px-8">
      <Bot size={48} className="mb-4 opacity-50" />
      <h3 className="text-lg font-semibold mb-2 text-gray-700">开始对话</h3>
      <p className="text-sm text-center leading-relaxed">
        使用快捷操作或输入您的问题
        <br />
        我会基于当前页面内容为您解答
      </p>
    </div>
  );
}

export function ChatContainer({
  messages,
  isLoading,
  error,
  inputValue,
  onInputChange,
  onSend,
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                isStreaming={message.isStreaming}
              />
            ))}
            {isLoading && !messages.some(m => m.isStreaming) && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center flex-shrink-0">
                  <Bot size={18} className="text-white" />
                </div>
                <TypingIndicator />
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <InputArea
        value={inputValue}
        onChange={onInputChange}
        onSend={onSend}
        disabled={isLoading}
      />
    </div>
  );
}
