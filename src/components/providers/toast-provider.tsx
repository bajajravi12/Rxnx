'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type ToastVariant = 'default' | 'success' | 'error';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-border text-foreground',
  success: 'border-online/40 text-foreground',
  error: 'border-danger/40 text-foreground',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: { title: string; description?: string; variant?: ToastVariant }) => {
      idCounter.current += 1;
      const id = `toast_${idCounter.current}`;
      setToasts((prev) => [...prev, { id, variant: input.variant ?? 'default', ...input }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = VARIANT_ICON[t.variant];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-raised p-3 shadow-panel dark:shadow-panel-dark',
                  VARIANT_CLASSES[t.variant],
                )}
              >
                <Icon
                  size={18}
                  className={cn(
                    'mt-0.5 shrink-0',
                    t.variant === 'success' && 'text-online',
                    t.variant === 'error' && 'text-danger',
                    t.variant === 'default' && 'text-foreground-muted',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-foreground-muted">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="nova-focus-ring shrink-0 rounded p-0.5 text-foreground-subtle hover:text-foreground"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
