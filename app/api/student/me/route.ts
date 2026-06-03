import { NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { getDatabaseSetupErrors } from '@/lib/postgres-url';

export const dynamic = 'force-dynamic';

/** Reliable student session check (prefer over generic /api/auth/session on Vercel). */
export async function GET() {
  const configErrors = getDatabaseSetupErrors();
  if (configErrors.length) {
    return NextResponse.json(
      { authenticated: false, error: 'Server misconfigured', hint: configErrors.join(' ') },
      { status: 503 },
    );
  }

  const session = await getSafeSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    id: user.id,
    email: user.email ?? null,
    role: user.role ?? 'student',
  });
}
