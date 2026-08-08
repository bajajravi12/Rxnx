import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, active, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'nova-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
          active && 'bg-nova-100 text-nova-700 dark:bg-nova-900 dark:text-nova-200',
          className,
        )}
        {...props}
      />
    );
  },
);
IconButton.displayName = 'IconButton';
