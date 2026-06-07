import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { isSetupRoutesEnabled } from '@/lib/setup/is-setup-enabled';
import { isStrictProduction } from '@/lib/production';

function setupSecretOk(request: NextRequest): boolean {
  const secret = process.env.RDS_SETUP_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('x-setup-secret')?.trim();
  if (header === secret) return true;
  if (!isStrictProduction()) {
    const query = request.nextUrl?.searchParams.get('setup_secret')?.trim();
    return query === secret;
  }
  return false;
}

/**
 * Blocks unauthenticated setup/seed/reset unless admin session or RDS_SETUP_SECRET matches.
 */
export async function guardSetupRoute(request: NextRequest): Promise<NextResponse | null> {
  if (!isSetupRoutesEnabled()) {
    return NextResponse.json({ error: 'Setup routes are disabled in production.' }, { status: 404 });
  }

  if (setupSecretOk(request)) return null;

  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) {
    return NextResponse.json(
      {
        error:
          'Setup routes require admin login or X-Setup-Secret header matching RDS_SETUP_SECRET.',
      },
      { status: 403 },
    );
  }
  return null;
}
