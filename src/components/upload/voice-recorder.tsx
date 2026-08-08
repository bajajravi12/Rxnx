'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils/cn';

function pickSupportedMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'audio/webm';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({ onRecorded }: { onRecorded: (blob: Blob, mimeType: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
    setRecording(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  async function start() {
    setError(null);
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          onRecorded(blob, mimeTypeRef.current);
        }
        cleanup();
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access was denied.');
    }
  }

  function stop() {
    cancelledRef.current = false;
    mediaRecorderRef.current?.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    mediaRecorderRef.current?.stop();
  }

  if (error) {
    return <p className="px-2 text-xs text-danger">{error}</p>;
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1.5">
        <span className={cn('h-2 w-2 rounded-full bg-danger', 'animate-pulse')} />
        <span className="text-xs font-medium text-danger tabular-nums">{formatDuration(seconds)}</span>
        <IconButton aria-label="Cancel recording" onClick={cancel} className="h-6 w-6 text-danger hover:bg-danger/10">
          <Trash2 size={13} />
        </IconButton>
        <IconButton
          aria-label="Stop and send recording"
          onClick={stop}
          className="h-6 w-6 bg-danger text-white hover:bg-danger/90"
        >
          <Square size={11} fill="currentColor" />
        </IconButton>
      </div>
    );
  }

  return (
    <IconButton aria-label="Record voice note" onClick={start}>
      <Mic size={18} />
    </IconButton>
  );
}
