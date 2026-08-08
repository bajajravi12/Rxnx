import { cn } from '@/lib/utils/cn';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
};

const DOT_SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-4 w-4',
};

// Deterministic hue from the name so the same person always gets the same
// fallback color across sessions, without needing to store a color choice.
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function Avatar({ src, name, size = 'md', online, className }: AvatarProps) {
  const hue = nameToHue(name);

  return (
    <div className={cn('relative shrink-0', SIZE_CLASSES[size], className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars are served from R2 via our own proxy, not optimizable by next/image on the edge runtime
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundColor: `hsl(${hue}, 55%, 48%)` }}
        >
          {getInitials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-surface',
            DOT_SIZE_CLASSES[size],
            online ? 'bg-online' : 'bg-ink-400',
          )}
        />
      )}
    </div>
  );
}
