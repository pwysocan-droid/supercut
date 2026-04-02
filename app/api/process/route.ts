import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const railwayUrl = process.env.RAILWAY_URL;
  if (!railwayUrl) {
    return NextResponse.json({ error: 'RAILWAY_URL not configured' }, { status: 500 });
  }

  // Stream the multipart body directly to Railway — no buffering
  const contentType = req.headers.get('content-type') ?? '';
  const res = await fetch(`${railwayUrl}/upload`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: req.body,
    // @ts-expect-error — duplex is required for streaming request bodies
    duplex: 'half',
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || 'Upload failed' }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
