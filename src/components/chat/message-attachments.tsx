import { Download, FileText } from 'lucide-react';
import { formatFileSize, truncateFileName } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { PublicAttachment } from '@/lib/db/attachments';

export function MessageAttachments({ attachments, isOwn }: { attachments: PublicAttachment[]; isOwn: boolean }) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === 'image');
  const others = attachments.filter((a) => a.kind !== 'image');

  return (
    <div className="mb-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((img) => (
            <a key={img.id} href={img.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- served via our own authenticated proxy, not next/image-optimizable */}
              <img src={img.url} alt={img.fileName} className="h-full max-h-72 w-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {others.map((attachment) => {
        if (attachment.kind === 'video') {
          return (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video key={attachment.id} controls src={attachment.url} className="max-h-72 w-full rounded-lg" />
          );
        }
        if (attachment.kind === 'audio' || attachment.kind === 'voice') {
          return (
            <audio key={attachment.id} controls src={attachment.url} className="h-10 w-64 max-w-full" />
          );
        }
        return (
          <a
            key={attachment.id}
            href={`${attachment.url}?download=1`}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2',
              isOwn ? 'border-white/25 hover:bg-white/10' : 'border-border hover:bg-surface-sunken',
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                isOwn ? 'bg-white/15' : 'bg-nova-100 dark:bg-nova-900',
              )}
            >
              <FileText size={16} className={isOwn ? 'text-white' : 'text-nova-600 dark:text-nova-300'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{truncateFileName(attachment.fileName, 28)}</p>
              <p className={cn('text-[11px]', isOwn ? 'text-white/70' : 'text-foreground-subtle')}>
                {formatFileSize(attachment.sizeBytes)}
              </p>
            </div>
            <Download size={14} className={isOwn ? 'text-white/80' : 'text-foreground-subtle'} />
          </a>
        );
      })}
    </div>
  );
}
