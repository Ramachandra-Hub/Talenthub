import { resolvePublicAppUrl } from '@/lib/setup/deployment-ready';

function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/**
 * NextAuth redirects (sign-out errors, callbacks) use AUTH_URL / NEXTAUTH_URL.
 * On Vercel, a leftover localhost AUTH_URL causes redirects to :3000 and MissingCSRF.
 * Locally, a leftover production AUTH_URL prevents the session cookie from sticking
 * (admin sign-in succeeds, then /api/admin/verify returns Unauthorized).
 */
export function ensureAuthUrlEnv(): string | undefined {
  const publicUrl = resolvePublicAppUrl();
  const authUrl = process.env.AUTH_URL?.trim() ?? '';
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim() ?? '';
  const isDev = process.env.NODE_ENV === 'development';

  let resolved = authUrl || nextAuthUrl || publicUrl;

  // Prefer production public URL only when not developing locally.
  if (
    !isDev &&
    publicUrl &&
    (!resolved || isLocalhostUrl(resolved)) &&
    !isLocalhostUrl(publicUrl)
  ) {
    resolved = publicUrl;
  }

  // Local development: never keep a remote AUTH_URL (breaks cookies on localhost).
  if (isDev && resolved && !isLocalhostUrl(resolved)) {
    resolved = 'http://localhost:3000';
  }

  if (resolved) {
    const normalized = resolved.replace(/\/$/, '');
    process.env.AUTH_URL = normalized;
    process.env.NEXTAUTH_URL = normalized;
    return normalized;
  }

  return undefined;
}
