import { NextResponse } from 'next/server';

/** Lightweight route to confirm a Vercel deployment exists (no database). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'talenthub',
    ts: new Date().toISOString(),
  });
}
