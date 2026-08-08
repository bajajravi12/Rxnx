import { forwardRef, useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
  maxRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoGrow = false, maxRows = 8, onInput, value, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
      if (!autoGrow) return;
      const el = internalRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight || '20');
      const maxHeight = lineHeight * maxRows;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [autoGrow, maxRows, value]);

    return (
      <textarea
        ref={(node) => {
          internalRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        rows={1}
        value={value}
        onInput={onInput}
        className={cn(
          'nova-focus-ring w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-2 text-sm text-foreground placeholder:text-foreground-subtle',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
