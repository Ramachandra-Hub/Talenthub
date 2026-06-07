import { isStrictProduction } from '@/lib/production';

/** Setup/seed/reset HTTP routes — off in production unless explicitly enabled. */
export function isSetupRoutesEnabled(): boolean {
  if (process.env.ALLOW_SETUP_ROUTES === 'true') return true;
  if (process.env.ALLOW_SETUP_ROUTES === 'false') return false;
  return !isStrictProduction();
}
