import { resolvePublicAppUrl } from '@/lib/setup/deployment-ready';

function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/**
 * NextAuth redirects (sign-out errors, callbacks) use AUTH_URL / NEXTAUTH_URL.
 * On Vercel, a leftover localhost AUTH_URL causes redirects to :3000 and MissingCSRF.
 */
export function ensureAuthUrlEnv(): string | undefined {
  const publicUrl = resolvePublicAppUrl();
  const authUrl = process.env.AUTH_URL?.trim() ?? '';
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim() ?? '';

  let resolved = authUrl || nextAuthUrl || publicUrl;
  if (publicUrl && (!resolved || isLocalhostUrl(resolved)) && !isLocalhostUrl(publicUrl)) {
    resolved = publicUrl;
  }

  if (resolved) {
    const normalized = resolved.replace(/\/$/, '');
    process.env.AUTH_URL = normalized;
    process.env.NEXTAUTH_URL = normalized;
    return normalized;
  }

  return undefined;
}
