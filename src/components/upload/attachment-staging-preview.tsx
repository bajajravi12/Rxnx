'use client';

import { FileText, Music, Video, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils/cn';
import { formatFileSize, truncateFileName } from '@/lib/utils/format';
import type { StagedFile } from './use-attachment-staging';

export function AttachmentStagingPreview({ files, onRemove }: { files: StagedFile[]; onRemove: (localId: string) => void }) {
  if (files.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2 border-b border-border pb-2">
      {files.map((f) => (
        <div
          key={f.localId}
          className={cn(
            'relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border',
            f.status === 'error' ? 'border-danger/40' : 'border-border',
          )}
        >
          {f.previewUrl ? (
            f.kind === 'video' ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={f.previewUrl} className="h-full w-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.previewUrl} alt={f.file.name} className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-surface-sunken p-1 text-center">
              {f.kind === 'audio' || f.kind === 'voice' ? (
                <Music size={18} className="text-foreground-subtle" />
              ) : f.kind === 'video' ? (
                <Video size={18} className="text-foreground-subtle" />
              ) : (
                <FileText size={18} className="text-foreground-subtle" />
              )}
              <span className="w-full truncate text-[9px] text-foreground-subtle">
                {truncateFileName(f.file.name, 12)}
              </span>
            </div>
          )}

          {f.status === 'uploading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-950/50">
              <Spinner size={16} className="text-white" />
            </div>
          )}

          {f.status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-danger/70 p-1 text-center text-[9px] text-white">
              {f.error ?? 'Failed'}
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemove(f.localId)}
            aria-label={`Remove ${f.file.name}`}
            className="nova-focus-ring absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink-950/70 text-white hover:bg-ink-950"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      {files.length > 0 && (
        <div className="flex items-center px-1 text-[11px] text-foreground-subtle">
          {files.length} file{files.length > 1 ? 's' : ''} · {formatFileSize(files.reduce((sum, f) => sum + f.file.size, 0))}
        </div>
      )}
    </div>
  );
}
