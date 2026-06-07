import { NextRequest, NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/safe-redirect';

/** Legacy OAuth callback — NextAuth handles auth at /api/auth/[...nextauth]. */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = safeNextPath(requestUrl.searchParams.get('next'), '/auth/role');
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
