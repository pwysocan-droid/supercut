const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { uploadToGemini, waitForFileActive, analyzeClip } = require('./gemini');
const { cutAndConcatenate } = require('./ffmpeg');

const app = express();
app.use(cors());
app.use(express.json());

const TEMP_DIR = process.env.TEMP_DIR || '/tmp/supercut';
fs.mkdirSync(TEMP_DIR, { recursive: true });

// In-memory job store (single instance — fine for Railway)
const jobs = new Map();

const upload = multer({ dest: TEMP_DIR });

// POST /upload — receive files, kick off processing, return jobId immediately
app.post('/upload', upload.fields([{ name: 'files' }, { name: 'reference', maxCount: 1 }]), (req, res) => {
  const jobId = uuidv4();
  const { intent = '', duration = '30', intensity = '5' } = req.body;
  const files = req.files['files'] || [];
  const reference = (req.files['reference'] || [])[0] || null;

  jobs.set(jobId, { step: 'uploading', progress: 0 });
  res.json({ jobId });

  processJob(jobId, files, reference, intent, Number(duration), Number(intensity)).catch((err) => {
    console.error(`Job ${jobId} failed:`, err);
    jobs.set(jobId, { step: 'error', progress: 0, error: err.message });
  });
});

// GET /status/:jobId
app.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /download/:jobId — stream the output file
app.get('/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.step !== 'complete') {
    return res.status(404).json({ error: 'Not ready' });
  }

  const outputPath = path.join(TEMP_DIR, req.params.jobId, 'output.mp4');
  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ error: 'Output file not found' });
  }

  const stat = fs.statSync(outputPath);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', 'attachment; filename="supercut.mp4"');
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(outputPath).pipe(res);
});

// --- Processing pipeline ---

async function processJob(jobId, files, referenceFile, intent, duration, intensity = 5) {
  const jobDir = path.join(TEMP_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  console.log(`Job ${jobId}: ${files.length} clips, target ${duration}s, intensity ${intensity}, intent: "${intent}"`);

  // Move multer temp files into job directory with safe filenames
  const filePaths = files.map((f, i) => {
    const safeName = `${i}_${f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = path.join(jobDir, safeName);
    fs.renameSync(f.path, dest);
    return { path: dest, originalName: f.originalname };
  });

  updateJob(jobId, 'analyzing', 5);

  // Upload reference + all clips to Gemini File API in parallel
  let referenceUri = null;
  if (referenceFile) {
    const safeName = `ref_${referenceFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const refDest = path.join(jobDir, safeName);
    fs.renameSync(referenceFile.path, refDest);
    const refGemini = await uploadToGemini(refDest);
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

  // Per-clip analysis in parallel — Gemini returns up to 3 moments per clip
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

  // Flatten all moments from all clips into a single candidate pool
  const allCandidates = clipMoments.flat();
  console.log(`Total candidates: ${allCandidates.length} across ${geminiFiles.length} clips`);

  updateJob(jobId, 'selecting', 60, '');

  // Greedy selection: sort by score, max 1 moment per clip per pass.
  // If target duration isn't met, loop again allowing reuse (no time overlap within clip).
  const sorted = [...allCandidates].sort((a, b) => b.score - a.score);
  const selected = [];
  const usedRanges = new Map(); // clipIndex → [{start, end}]
  let total = 0;
  let passes = 0;

  while (total < duration && passes < 3) {
    let addedThisPass = 0;
    for (const c of sorted) {
      if (total >= duration) break;
      const ranges = usedRanges.get(c.clipIndex) || [];
      const overlaps = ranges.some((r) => c.start < r.end && c.end > r.start);
      if (overlaps) continue;
      // On first pass: each clip used once. On later passes: allow reuse.
      if (passes === 0 && ranges.length > 0) continue;
      selected.push(c);
      usedRanges.set(c.clipIndex, [...ranges, { start: c.start, end: c.end }]);
      total += c.end - c.start;
      addedThisPass++;
    }
    passes++;
    if (addedThisPass === 0) break; // no more candidates
  }

  // Sort by (clipIndex, start) for natural narrative order
  selected.sort((a, b) => a.clipIndex !== b.clipIndex ? a.clipIndex - b.clipIndex : a.start - b.start);
  console.log(`Selected ${selected.length} moments, ~${total.toFixed(1)}s`);

  updateJob(jobId, 'rendering', 70, '');

  const segments = selected.map((c) => ({ inputPath: c.filePath, start: c.start, end: c.end }));
  console.log(`Rendering ${segments.length} segments`);
  const outputPath = path.join(jobDir, 'output.mp4');
  await cutAndConcatenate(segments, outputPath);
  updateJob(jobId, 'rendering', 95, '');

  // Build per-clip result summary for the UI
  const clipResults = {};
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
  jobs.set(jobId, {
    step: 'complete',
    progress: 100,
    outputSize: size,
    clipResults,
  });
}

function updateJob(jobId, step, progress, message = '') {
  const current = jobs.get(jobId) || {};
  jobs.set(jobId, { ...current, step, progress, message });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Supercut Railway service on :${PORT}`));
