import { NextResponse } from 'next/server';
import { clientIp, rateLimitInMemory } from '@/lib/rate-limit';
import { isStrictProduction } from '@/lib/production';

/** Rate-limit anonymous public API probes (ping, health, blog). */
export function guardPublicApi(request: Request, routeKey: string): NextResponse | null {
  const ip = clientIp(request);
  const limit = isStrictProduction() ? 30 : 120;
  const burst = rateLimitInMemory(`public:${routeKey}:${ip}`, limit, 60_000);
  if (!burst.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(burst.retryAfterSec) } },
    );
  }
  return null;
}
