'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';

export type SocketStatus = 'connecting' | 'open' | 'closed';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

/**
 * Connects to a ticket-authenticated WebSocket endpoint (see
 * src/lib/realtime/ticket.ts / src/app/api/ws/*) and keeps it alive with
 * exponential-backoff reconnection. `ticketPath` is a same-origin API
 * route (e.g. `/api/ws/presence` or `/api/ws/${chatId}`) that mints a
 * fresh ticket and returns `{ url }` — passing `null` disables the
 * connection entirely (e.g. no chat is open yet).
 */
export function useRealtimeSocket<TEvent>(
  ticketPath: string | null,
  onEvent: (event: TEvent) => void,
): { status: SocketStatus; send: (data: unknown) => void } {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  useEffect(() => {
    if (!ticketPath) {
      setStatus('closed');
      return;
    }

    let cancelled = false;
    setStatus('connecting');

    async function connect() {
      try {
        const { url } = await api.get<{ url: string }>(ticketPath as string);
        if (cancelled) return;

        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.addEventListener('open', () => {
          if (cancelled) return;
          backoffRef.current = INITIAL_BACKOFF_MS;
          setStatus('open');
        });

        socket.addEventListener('message', (messageEvent) => {
          if (cancelled) return;
          try {
            const parsed = JSON.parse(messageEvent.data) as TEvent;
            onEventRef.current(parsed);
          } catch {
            // Ignore malformed frames rather than crashing the connection.
          }
        });

        socket.addEventListener('close', () => {
          if (cancelled) return;
          setStatus('closed');
          scheduleReconnect();
        });

        socket.addEventListener('error', () => {
          try {
            socket.close();
          } catch {
            // already closed
          }
        });
      } catch {
        if (!cancelled) {
          setStatus('closed');
          scheduleReconnect();
        }
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      reconnectTimeoutRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        connect();
      }, backoffRef.current);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [ticketPath]);

  function send(data: unknown): void {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  return { status, send };
}
