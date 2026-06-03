import type { Session } from 'next-auth';
import { auth } from '@/auth';

/** Decode session without throwing (expired JWT, bad AUTH_SECRET, etc.). */
export async function getSafeSession(): Promise<Session | null> {
  try {
    const session = await auth();
    return session ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('JWT') && !message.includes('session')) {
      console.error('[auth] getSafeSession failed:', err);
    }
    return null;
  }
}
