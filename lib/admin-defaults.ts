/** Default institutional admin email (overridable via .env.local). */
export const DEFAULT_ADMIN_EMAIL = 'admin@rce.ac.in';

/** Default institutional admin password (overridable via PREPINDIA_ADMIN_PASSWORD). */
export const DEFAULT_ADMIN_PASSWORD = 'RCE_T&P';

export function getConfiguredAdminEmail(): string {
  return (
    process.env.PREPINDIA_ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL
  );
}

export function getConfiguredAdminPassword(): string {
  const fromEnv = process.env.PREPINDIA_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_ADMIN_PASSWORD;
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
