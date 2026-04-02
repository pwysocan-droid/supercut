import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const railwayUrl = process.env.RAILWAY_URL;
  if (!railwayUrl) {
    return NextResponse.json({ error: 'RAILWAY_URL not configured' }, { status: 500 });
  }

  const { jobId } = await params;
  const res = await fetch(`${railwayUrl}/download/${jobId}`);
  if (!res.ok) {
    return NextResponse.json({ error: 'Not ready' }, { status: 404 });
  }

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="supercut.mp4"',
    },
  });
}
