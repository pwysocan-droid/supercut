const { execFile } = require('child_process');

// Single-pass cut + concatenate using filter_complex.
// Each segment is sought, trimmed, and concatenated in one ffmpeg invocation.
// This avoids timestamp discontinuities and keyframe issues from the two-step approach.
//
// segments: [{ inputPath, start, end }, ...]
function cutAndConcatenate(segments, outputPath) {
  const valid = segments.filter((s) => s.end - s.start >= 0.4);
  if (valid.length === 0) return Promise.reject(new Error('No valid segments'));

  const args = [];

  // Input options: one -ss/-t/-i block per segment
  for (const seg of valid) {
    args.push('-ss', String(seg.start), '-t', String(seg.end - seg.start), '-i', seg.inputPath);
  }

  // Normalize each stream then concat
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

module.exports = { cutAndConcatenate };
