'use client';

import { Moon, Sun, SunMoon } from 'lucide-react';
import { useTheme, type Theme } from '@/components/providers/theme-provider';
import { cn } from '@/lib/utils/cn';

const OPTIONS: Array<{ value: Theme; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: SunMoon, label: 'System' },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          className={cn(
            'nova-focus-ring flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm',
            theme === opt.value
              ? 'border-nova-500 bg-nova-50 text-nova-700 dark:bg-nova-950 dark:text-nova-200'
              : 'border-border text-foreground-muted hover:bg-surface-sunken',
          )}
        >
          <opt.icon size={18} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
