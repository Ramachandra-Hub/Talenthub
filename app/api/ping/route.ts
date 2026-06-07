import { NextResponse } from 'next/server';
import { guardPublicApi } from '@/lib/public-api-guard';

/** Lightweight liveness — no database, no timestamps (rate-limited). */
export async function GET(request: Request) {
  const denied = guardPublicApi(request, 'ping');
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
