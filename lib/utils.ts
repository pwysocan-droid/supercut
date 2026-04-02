export function formatSize(bytes: number): string {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '?';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function processVideoFile(
  file: File
): Promise<{ duration: number; thumbnail: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1, video.duration * 0.1);
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas context');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({
          duration: video.duration,
          thumbnail: canvas.toDataURL('image/jpeg', 0.7),
        });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    });
  });
}
