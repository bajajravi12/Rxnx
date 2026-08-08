export interface MediaMetadata {
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export async function extractMediaMetadata(file: File, kind: 'image' | 'video' | 'audio' | 'voice' | 'document'): Promise<MediaMetadata> {
  if (kind === 'image') return extractImageMetadata(file);
  if (kind === 'video') return extractVideoMetadata(file);
  if (kind === 'audio' || kind === 'voice') return extractAudioMetadata(file);
  return {};
}

function extractImageMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function extractVideoMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

function extractAudioMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve({ durationSeconds: Number.isFinite(audio.duration) ? Math.round(audio.duration) : undefined });
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    audio.src = url;
  });
}
