import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { jobs } from '@/lib/jobs';
import { uploadToGemini, waitForFileActive, analyzeClip } from '@/lib/gemini';
import { cutAndConcatenate } from '@/lib/ffmpeg';
import { JobStatus, ClipResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TEMP_DIR = process.env.TEMP_DIR || '/tmp/supercut';

function updateJob(jobId: string, step: JobStatus['step'], progress: number, message = '') {
  const current = jobs.get(jobId) || ({} as JobStatus);
  jobs.set(jobId, { ...current, step, progress, message });
}

async function processJob(
  jobId: string,
  filePaths: { path: string; originalName: string }[],
  referenceFilePath: string | null,
  intent: string,
  duration: number,
  intensity: number
) {
  console.log(`Job ${jobId}: ${filePaths.length} clips, target ${duration}s, intensity ${intensity}, intent: "${intent}"`);

  updateJob(jobId, 'analyzing', 5);

  let referenceUri: string | null = null;
  if (referenceFilePath) {
    const refGemini = await uploadToGemini(referenceFilePath);
    const refActive = await waitForFileActive(refGemini);
    referenceUri = refActive.uri;
    console.log(`Reference uploaded: ${referenceUri}`);
  }

  const geminiFiles = await Promise.all(
    filePaths.map(async (f) => {
      const geminiFile = await uploadToGemini(f.path);
      const active = await waitForFileActive(geminiFile);
      return { ...f, geminiUri: active.uri, geminiName: active.name };
    })
  );

  updateJob(jobId, 'analyzing', 35, `Analyzing 0/${geminiFiles.length} clips`);

  let analyzedCount = 0;
  const clipMoments = await Promise.all(
    geminiFiles.map(async (f, i) => {
      const moments = await analyzeClip(f.geminiUri, f.originalName, intent, referenceUri, intensity);
      analyzedCount++;
      updateJob(
        jobId, 'analyzing',
        35 + Math.round((analyzedCount / geminiFiles.length) * 25),
        `Analyzed ${analyzedCount}/${geminiFiles.length} clips`
      );
      return moments.map((m) => ({
        clipIndex: i,
        filename: f.originalName,
        filePath: f.path,
        start: m.start,
        end: m.end,
        score: m.score,
        reason: m.reason,
      }));
    })
  );

  const allCandidates = clipMoments.flat();
  console.log(`Total candidates: ${allCandidates.length} across ${geminiFiles.length} clips`);

  updateJob(jobId, 'selecting', 60, '');

  const sorted = [...allCandidates].sort((a, b) => b.score - a.score);
  const selected: typeof sorted = [];
  const usedRanges = new Map<number, { start: number; end: number }[]>();
  let total = 0;
  let passes = 0;

  while (total < duration && passes < 3) {
    let addedThisPass = 0;
    for (const c of sorted) {
      if (total >= duration) break;
      const ranges = usedRanges.get(c.clipIndex) || [];
      const overlaps = ranges.some((r) => c.start < r.end && c.end > r.start);
      if (overlaps) continue;
      if (passes === 0 && ranges.length > 0) continue;
      selected.push(c);
      usedRanges.set(c.clipIndex, [...ranges, { start: c.start, end: c.end }]);
      total += c.end - c.start;
      addedThisPass++;
    }
    passes++;
    if (addedThisPass === 0) break;
  }

  selected.sort((a, b) => a.clipIndex !== b.clipIndex ? a.clipIndex - b.clipIndex : a.start - b.start);
  console.log(`Selected ${selected.length} moments, ~${total.toFixed(1)}s`);

  updateJob(jobId, 'rendering', 70, '');

  const jobDir = path.join(TEMP_DIR, jobId);
  const outputPath = path.join(jobDir, 'output.mp4');
  const segments = selected.map((c) => ({ inputPath: c.filePath, start: c.start, end: c.end }));
  console.log(`Rendering ${segments.length} segments`);
  await cutAndConcatenate(segments, outputPath);
  updateJob(jobId, 'rendering', 95, '');

  const clipResults: Record<string, ClipResult> = {};
  clipMoments.forEach((moments, i) => {
    const name = geminiFiles[i].originalName;
    const best = moments.reduce((a, b) => (a.score >= b.score ? a : b));
    clipResults[name] = {
      score: best.score,
      reason: best.reason,
      momentCount: moments.length,
      selected: selected.some((s) => s.filename === name),
    };
  });

  const { size } = fs.statSync(outputPath);
  jobs.set(jobId, { step: 'complete', progress: 100, outputSize: size, clipResults });
}

export async function POST(req: NextRequest) {
  const jobId = crypto.randomUUID();
  const jobDir = path.join(TEMP_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  const referenceFile = formData.get('reference') as File | null;
  const intent = (formData.get('intent') as string) || '';
  const duration = Number(formData.get('duration') || 30);
  const intensity = Number(formData.get('intensity') || 5);

  const filePaths: { path: string; originalName: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = `${i}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = path.join(jobDir, safeName);
    fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
    filePaths.push({ path: dest, originalName: file.name });
  }

  let referenceFilePath: string | null = null;
  if (referenceFile) {
    const safeName = `ref_${referenceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    referenceFilePath = path.join(jobDir, safeName);
    fs.writeFileSync(referenceFilePath, Buffer.from(await referenceFile.arrayBuffer()));
  }

  jobs.set(jobId, { step: 'uploading', progress: 0 });

  // Fire and forget — response returns immediately, job runs in background
  processJob(jobId, filePaths, referenceFilePath, intent, duration, intensity).catch((err) => {
    console.error(`Job ${jobId} failed:`, err);
    jobs.set(jobId, { step: 'error', progress: 0, error: err.message });
  });

  return NextResponse.json({ jobId });
}
