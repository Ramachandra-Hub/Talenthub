import { NextResponse } from 'next/server';
import { formatElevateXCredentialsCsv } from '@/lib/elevatex-credentials-export';
import {
  ELEVATEX_SAMPLE_COUNT,
  ELEVATEX_SAMPLE_PASSWORD,
} from '@/lib/elevatex-sample-credentials';

/** Dynamic CSV download (always current count — works on Vercel; static public/ file may be stale). */
export async function GET() {
  const password =
    process.env.ELEVATEX_SAMPLE_PASSWORD?.trim() || ELEVATEX_SAMPLE_PASSWORD;
  const csv = formatElevateXCredentialsCsv(undefined, password);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="elevatex-slot1-credentials.csv"',
      'Cache-Control': 'no-store, max-age=0',
      'X-Elevatex-Row-Count': String(ELEVATEX_SAMPLE_COUNT),
    },
  });
}
