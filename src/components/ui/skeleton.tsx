import { cn } from '@/lib/utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('nova-skeleton rounded-md', className)} />;
}

export function ChatListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function MessageBubbleSkeleton({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <div className={cn('flex', align === 'right' ? 'justify-end' : 'justify-start')}>
      <Skeleton className={cn('h-10 rounded-bubble', align === 'right' ? 'w-40' : 'w-52')} />
    </div>
  );
}
