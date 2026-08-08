'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '@/lib/notifications/browser-notifications';

export function NotificationsSection() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  async function handleEnable() {
    const result = await requestNotificationPermission();
    setPermission(result);
  }

  if (!isNotificationSupported()) {
    return <p className="text-sm text-foreground-muted">Notifications aren&apos;t supported in this browser.</p>;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {permission === 'granted' ? (
          <Bell size={18} className="text-nova-600 dark:text-nova-300" />
        ) : (
          <BellOff size={18} className="text-foreground-subtle" />
        )}
        <div>
          <p className="text-sm text-foreground">
            {permission === 'granted' && 'Notifications are enabled'}
            {permission === 'denied' && 'Notifications are blocked'}
            {permission === 'default' && 'Notifications are off'}
          </p>
          {permission === 'denied' && (
            <p className="text-xs text-foreground-subtle">
              Blocked at the browser level — re-enable it in your browser&apos;s site settings.
            </p>
          )}
        </div>
      </div>
      {permission === 'default' && (
        <Button size="sm" variant="secondary" onClick={handleEnable}>
          Enable
        </Button>
      )}
    </div>
  );
}
