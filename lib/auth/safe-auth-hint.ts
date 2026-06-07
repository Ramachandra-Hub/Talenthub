import { isStrictProduction } from '@/lib/production';

/** Avoid leaking env var names or stack details in production auth responses. */
export function safeAuthHint(detail: string, fallback: string): string {
  if (!isStrictProduction()) return detail;
  return fallback;
}
