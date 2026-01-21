import React, { forwardRef, TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface InputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  onSend?: () => void;
}

export const Input = forwardRef<HTMLTextAreaElement, InputProps>(
  ({ className, onSend, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend?.();
      }
      onKeyDown?.(e);
    };

    return (
      <textarea
        ref={ref}
        className={clsx(
          'w-full px-4 py-3 border-2 border-gray-200 rounded-lg resize-none',
          'focus:outline-none focus:border-primary',
          'placeholder:text-gray-400',
          className
        )}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
