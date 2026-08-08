'use client';

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/lib/notifications/browser-notifications';

const DISMISSED_STORAGE_KEY = 'nova-notification-banner-dismissed';

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isNotificationSupported()) return;
    const dismissed = localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
    setVisible(!dismissed && getNotificationPermission() === 'default');
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
    setVisible(false);
  }

  async function enable() {
    await requestNotificationPermission();
    // Whatever the outcome (granted or denied), the browser's own
    // permission prompt won't be shown again automatically — the user
    // would need to change it via browser settings — so this banner has
    // done its job either way.
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="flex items-start gap-2.5 border-b border-border bg-nova-50 px-4 py-2.5 dark:bg-nova-950">
      <BellRing size={16} className="mt-0.5 shrink-0 text-nova-600 dark:text-nova-300" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">Enable notifications</p>
        <p className="text-xs text-foreground-muted">Get notified about new messages when Nova isn&apos;t open.</p>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={enable}
            className="nova-focus-ring rounded-md bg-nova-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-nova-700"
          >
            Enable
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="nova-focus-ring rounded-md px-2.5 py-1 text-xs font-medium text-foreground-muted hover:bg-surface-sunken"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="nova-focus-ring shrink-0 rounded p-0.5 text-foreground-subtle hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
