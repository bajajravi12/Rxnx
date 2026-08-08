import { MessagesSquare } from 'lucide-react';

export default function ChatsIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-nova-100 dark:bg-nova-900">
        <MessagesSquare size={28} className="text-nova-600 dark:text-nova-300" />
      </div>
      <div>
        <p className="text-base font-medium text-foreground">Select a conversation</p>
        <p className="mt-1 text-sm text-foreground-muted">Choose a chat from the sidebar, or start a new one.</p>
      </div>
    </div>
  );
}
