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
  const res = await fetch(`${railwayUrl}/status/${jobId}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
