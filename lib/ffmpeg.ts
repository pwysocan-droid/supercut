import { execFile } from 'child_process';

export interface Segment {
  inputPath: string;
  start: number;
  end: number;
}

export function cutAndConcatenate(segments: Segment[], outputPath: string): Promise<void> {
  const valid = segments.filter((s) => s.end - s.start >= 0.4);
  if (valid.length === 0) return Promise.reject(new Error('No valid segments'));

  const args: string[] = [];

  for (const seg of valid) {
    args.push('-ss', String(seg.start), '-t', String(seg.end - seg.start), '-i', seg.inputPath);
  }

  const filterParts = valid
    .map((_, i) => `[${i}:v]scale=1920:-2,setsar=1,fps=fps=30[v${i}];[${i}:a]aresample=44100[a${i}]`)
    .join(';');
  const concatInputs = valid.map((_, i) => `[v${i}][a${i}]`).join('');
  const filter = `${filterParts};${concatInputs}concat=n=${valid.length}:v=1:a=1[vout][aout]`;

  args.push(
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', outputPath
  );

  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}
