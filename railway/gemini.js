const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

async function uploadToGemini(filePath) {
  const result = await fileManager.uploadFile(filePath, {
    mimeType: 'video/mp4',
    displayName: path.basename(filePath),
  });
  return result.file;
}

async function waitForFileActive(file) {
  let current = file;
  while (current.state === 'PROCESSING') {
    await new Promise((r) => setTimeout(r, 3000));
    current = await fileManager.getFile(current.name);
  }
  if (current.state !== 'ACTIVE') {
    throw new Error(`Gemini file ${current.name} failed: ${current.state}`);
  }
  return current;
}

// intensity 1–10 → target segment length in seconds
function intensityToRange(intensity) {
  const t = (intensity - 1) / 9; // 0 at intensity=1, 1 at intensity=10
  const targetSec = +(3.0 - t * 2.7).toFixed(2); // 3.0s at 1 → 0.3s at 10
  const minSec = +(targetSec * 0.9).toFixed(2);
  const maxSec = +(targetSec * 1.1).toFixed(2);
  return { targetSec, minSec, maxSec };
}

async function analyzeClip(fileUri, filename, intent, referenceUri = null, intensity = 5) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const { targetSec, minSec, maxSec } = intensityToRange(intensity);

  const parts = [];

  if (referenceUri) {
    parts.push({ text: 'Here is a reference video showing the style and energy I am looking for:' });
    parts.push({ fileData: { mimeType: 'video/mp4', fileUri: referenceUri } });
    parts.push({ text: 'Now analyze this clip and find the moment that best matches that style.' });
  }

  const intentLine = intent ? `Intent: "${intent}". ` : '';
  parts.push({ fileData: { mimeType: 'video/mp4', fileUri } });
  parts.push({
    text:
      `${intentLine}Find the single best moment in this clip for a video edit. ` +
      `Score it 1–10 based on: visual composition (framing, depth, interesting angles), ` +
      `kinetic energy (motion, pace, dynamism in frame), and emotional impact. ` +
      `Avoid fades, cuts-to-black, and transitions at the very start or end of the clip. ` +
      `Target each segment at ${targetSec}s. You may go up to ±10% shorter or longer ` +
      `(${minSec}–${maxSec}s) if the clip quality justifies it — a strong moment earns a ` +
      `slightly longer cut, a weak one gets trimmed tighter. ` +
      `Return only JSON, no other text:\n` +
      `{"start": <seconds>, "end": <seconds>, "score": <1-10>, "reason": "<one sentence>"}`,
  });

  // Ask for up to 3 distinct non-overlapping moments
  parts[parts.length - 1].text +=
    `\n\nReturn a JSON ARRAY of up to 3 distinct, non-overlapping moments sorted by score descending:\n` +
    `[{"start": <seconds>, "end": <seconds>, "score": <1-10>, "reason": "<one sentence>"}, ...]`;

  const result = await model.generateContent(parts);

  const text = result.response.text();
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed = JSON.parse(cleaned);
  // Normalize: Gemini sometimes returns a single object instead of an array
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed;
}

async function synthesizeSegments(analyses, duration, intent) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const clipsJson = JSON.stringify(
    analyses.map(({ filePath, ...rest }) => rest)
  );
  const prompt =
    `Here are scored segments from ${analyses.length} video clips. Select the best ` +
    `combination whose durations (end - start) sum to approximately ${duration} seconds.\n` +
    `Intent: "${intent}"\n` +
    `Clips: ${clipsJson}\n` +
    `Return only a JSON array, no other text. Use the "index" field to identify each clip:\n` +
    `[{"index": <number>, "start": <seconds>, "end": <seconds>}]\n` +
    `Order them for best narrative flow. Include as many clips as needed to reach the target duration.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { uploadToGemini, waitForFileActive, analyzeClip, synthesizeSegments, intensityToRange };
