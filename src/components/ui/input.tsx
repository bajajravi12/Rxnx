import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'nova-focus-ring h-11 w-full rounded-lg border bg-surface px-3.5 text-sm text-foreground placeholder:text-foreground-subtle',
        error ? 'border-danger' : 'border-border',
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';
