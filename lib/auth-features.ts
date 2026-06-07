/**
 * Bulk / exam-period mode: hide public signup and reject POST /api/auth/signup.
 * Students already in AWS RDS Auth can sign in only (supports many concurrent logins).
 *
 * Set in `.env.local`:
 * NEXT_PUBLIC_SIGNUP_DISABLED=true
 *
 * Redeploy or restart `pnpm dev` after changing.
 */
import { isStrictProduction } from '@/lib/production';

export function isSignupDisabled(): boolean {
  if (process.env.NEXT_PUBLIC_SIGNUP_DISABLED === 'true') return true;
  if (process.env.NEXT_PUBLIC_SIGNUP_DISABLED === 'false') return false;
  return isStrictProduction();
}
