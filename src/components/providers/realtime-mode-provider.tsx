'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type RealtimeMode = 'websocket' | 'polling';

const RealtimeModeContext = createContext<RealtimeMode | null>(null);

export function RealtimeModeProvider({ mode, children }: { mode: RealtimeMode; children: ReactNode }) {
  return <RealtimeModeContext.Provider value={mode}>{children}</RealtimeModeContext.Provider>;
}

export function useRealtimeMode(): RealtimeMode {
  const ctx = useContext(RealtimeModeContext);
  if (!ctx) {
    throw new Error('useRealtimeMode must be used within a RealtimeModeProvider');
  }
  return ctx;
}
