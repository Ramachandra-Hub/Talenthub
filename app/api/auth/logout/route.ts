import { NextResponse } from 'next/server';
import { performAppLogout } from '@/lib/auth/logout-server';

/** Sign out current user (student or admin). No CSRF — use instead of POST /api/auth/signout from the browser. */
export async function POST() {
  try {
    const result = await performAppLogout();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Logout failed';
    console.error('[auth/logout]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
