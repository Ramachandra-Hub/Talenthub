import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/** Reliable student session check (prefer over generic /api/auth/session on Vercel). */
export async function GET() {
  const session = await auth();
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
