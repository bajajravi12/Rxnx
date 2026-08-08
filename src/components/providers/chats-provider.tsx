'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useChats, type UseChatsResult } from '@/hooks/use-chats';

const ChatsContext = createContext<UseChatsResult | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const value = useChats();
  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}

export function useChatsContext(): UseChatsResult {
  const ctx = useContext(ChatsContext);
  if (!ctx) {
    throw new Error('useChatsContext must be used within a ChatsProvider');
  }
  return ctx;
}
