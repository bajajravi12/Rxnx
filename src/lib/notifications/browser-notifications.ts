export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

export interface ChatMessageNotificationInput {
  chatId: string;
  chatTitle: string;
  senderDisplayName: string;
  preview: string;
}

/**
 * Shows a native browser notification for a new chat message. Silently
 * does nothing if permission isn't granted or the API isn't supported —
 * callers are expected to have already decided (mute state, tab
 * visibility) that a notification is appropriate before calling this.
 */
export function showChatMessageNotification(input: ChatMessageNotificationInput): void {
  if (getNotificationPermission() !== 'granted') return;

  try {
    const notification = new Notification(`${input.senderDisplayName} · ${input.chatTitle}`, {
      body: input.preview,
      tag: `nova-chat-${input.chatId}`,
      // Collapses rapid successive messages in the same chat into one
      // notification slot instead of stacking a dozen OS notifications.
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = `/chats/${input.chatId}`;
      notification.close();
    };
  } catch {
    // Some browsers throw if constructed from an unexpected context
    // (e.g. certain mobile WebViews) — never let a notification failure
    // break the rest of the app.
  }
}
