import { cn } from '@/lib/utils/cn';

export function TypingIndicator({ users }: { users: Array<{ userId: string; displayName: string }> }) {
  if (users.length === 0) return null;

  const label =
    users.length === 1
      ? `${users[0]!.displayName} is typing`
      : users.length === 2
        ? `${users[0]!.displayName} and ${users[1]!.displayName} are typing`
        : `${users.length} people are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-foreground-muted">
      <span className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn('h-1.5 w-1.5 animate-typing-dot rounded-full bg-foreground-subtle')}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}
