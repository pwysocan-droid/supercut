import { NextRequest, NextResponse } from 'next/server';
import { jobs } from '@/lib/jobs';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const TEMP_DIR = process.env.TEMP_DIR || '/tmp/supercut';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = jobs.get(jobId);
  if (!job || job.step !== 'complete') {
    return NextResponse.json({ error: 'Not ready' }, { status: 404 });
  }

  const outputPath = path.join(TEMP_DIR, jobId, 'output.mp4');
  if (!fs.existsSync(outputPath)) {
    return NextResponse.json({ error: 'Output file not found' }, { status: 404 });
  }

  const stat = fs.statSync(outputPath);
  const fileStream = fs.createReadStream(outputPath);
  const readable = new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(chunk));
      fileStream.on('end', () => controller.close());
      fileStream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="supercut.mp4"',
      'Content-Length': String(stat.size),
    },
  });
}
