import { NextResponse } from 'next/server';
import { performAppLogout } from '@/lib/auth/logout-server';

/** @deprecated Prefer POST /api/auth/logout — kept for older clients (moved from /api/auth/student/signout). */
export async function POST() {
  try {
    const result = await performAppLogout();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Logout failed';
    console.error('[auth/student/signout]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
