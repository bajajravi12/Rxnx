'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, Moon, Search, Settings, SquarePen, Sun, SunMoon, Users } from 'lucide-react';
import { useSession } from '@/components/providers/session-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils/cn';
import { NewChatDialog } from './new-chat-dialog';
import { NewGroupDialog } from '@/components/group/new-group-dialog';

export function SidebarHeader() {
  const { user, logout } = useSession();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="nova-focus-ring rounded-full"
          aria-label="Account menu"
        >
          <Avatar src={user.avatarUrl} name={user.displayName} size="md" />
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-12 z-20 w-56 overflow-hidden rounded-xl border border-border bg-surface-raised py-1.5 shadow-panel dark:shadow-panel-dark">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-foreground">{user.displayName}</p>
              <p className="truncate text-xs text-foreground-muted">@{user.username}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="nova-focus-ring flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-sunken"
            >
              <Settings size={16} />
              Settings
            </Link>
            <div className="my-1 h-px bg-border" />
            <div className="px-2 py-1">
              <p className="px-1 pb-1 text-xs font-medium text-foreground-subtle">Appearance</p>
              <div className="flex gap-1">
                {(
                  [
                    { value: 'light' as const, icon: Sun, label: 'Light' },
                    { value: 'dark' as const, icon: Moon, label: 'Dark' },
                    { value: 'system' as const, icon: SunMoon, label: 'System' },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      'nova-focus-ring flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-xs',
                      theme === opt.value
                        ? 'bg-nova-100 text-nova-700 dark:bg-nova-900 dark:text-nova-200'
                        : 'text-foreground-muted hover:bg-surface-sunken',
                    )}
                  >
                    <opt.icon size={16} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => logout()}
              className="nova-focus-ring flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/5"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-base font-semibold tracking-tight text-foreground">Nova</span>
      </div>

      <div className="flex items-center gap-1">
        <Link href="/search" className="nova-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-foreground" aria-label="Search">
          <Search size={18} />
        </Link>
        <IconButton aria-label="New group" onClick={() => setNewGroupOpen(true)}>
          <Users size={18} />
        </IconButton>
        <IconButton aria-label="New chat" onClick={() => setNewChatOpen(true)}>
          <SquarePen size={18} />
        </IconButton>
      </div>

      <NewChatDialog open={newChatOpen} onClose={() => setNewChatOpen(false)} />
      <NewGroupDialog open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />
    </div>
  );
}
