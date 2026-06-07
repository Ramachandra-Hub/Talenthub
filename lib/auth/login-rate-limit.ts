import { NextResponse } from 'next/server';
import { clientIp, rateLimitInMemory } from '@/lib/rate-limit';
import { isStrictProduction } from '@/lib/production';

/** Brute-force protection on credential sign-in routes. */
export function guardLoginAttempt(
  request: Request,
  route: 'admin' | 'student',
  identifier?: string,
): NextResponse | null {
  const ip = clientIp(request);
  const idKey = identifier?.trim().toLowerCase().slice(0, 64) || 'unknown';
  const perIp = rateLimitInMemory(`login:${route}:ip:${ip}`, isStrictProduction() ? 15 : 40, 60_000);
  if (!perIp.ok) {
    return NextResponse.json(
      { error: 'Too many login attempts. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSec) } },
    );
  }
  const perId = rateLimitInMemory(`login:${route}:id:${idKey}`, isStrictProduction() ? 8 : 20, 60_000);
  if (!perId.ok) {
    return NextResponse.json(
      { error: 'Too many login attempts for this account. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': String(perId.retryAfterSec) } },
    );
  }
  return null;
}
