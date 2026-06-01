/** Resolve public app URL for setup/seed routes (Vercel or custom domain). */
export function resolvePublicAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return '';
}

/** AWS RDS + AUTH_SECRET required; no Supabase `.db.co` check. */
export function assertSetupDeploymentReady():
  | { ok: true; appUrl: string }
  | { ok: false; error: string } {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();

  if (!databaseUrl || /YOUR_/i.test(databaseUrl)) {
    return {
      ok: false,
      error: 'Set DATABASE_URL on Vercel to your AWS RDS PostgreSQL connection string.',
    };
  }

  if (!authSecret || authSecret.includes('YOUR_')) {
    return { ok: false, error: 'Set AUTH_SECRET on Vercel (used for auth and setup routes).' };
  }

  const appUrl = resolvePublicAppUrl();
  if (!appUrl) {
    return {
      ok: false,
      error:
        'Set NEXT_PUBLIC_APP_URL (e.g. https://talenthub-black.vercel.app) on Vercel.',
    };
  }

  return { ok: true, appUrl };
}
