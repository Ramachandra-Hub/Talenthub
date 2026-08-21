/** Default institutional admin email (overridable via .env.local). */
export const DEFAULT_ADMIN_EMAIL = 'admin@rce.ac.in';

/**
 * Legacy local-only fallback. Never used when NODE_ENV/VERCEL_ENV is production.
 * Production must set PREPINDIA_ADMIN_PASSWORD.
 */
const DEV_ONLY_ADMIN_PASSWORD = 'change-me-local-only';

export function getConfiguredAdminEmail(): string {
  return (
    process.env.PREPINDIA_ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL
  );
}

export function getConfiguredAdminPassword(): string | null {
  const fromEnv = process.env.PREPINDIA_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProd) return null;
  return DEV_ONLY_ADMIN_PASSWORD;
}

/** @throws if production password is missing */
export function requireConfiguredAdminPassword(): string {
  const password = getConfiguredAdminPassword();
  if (!password) {
    throw new Error(
      'PREPINDIA_ADMIN_PASSWORD must be set in production. Refusing hardcoded admin password.',
    );
  }
  return password;
}

export function getAllowlistedAdminEmails(): string[] {
  const configured = getConfiguredAdminEmail();
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProd) return [configured];
  return [...new Set([DEFAULT_ADMIN_EMAIL, configured])];
}

export function isAllowlistedAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getAllowlistedAdminEmails().includes(email.trim().toLowerCase());
}
