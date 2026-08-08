'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';
import { ToastProvider } from './toast-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
