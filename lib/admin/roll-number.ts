import { COLLEGE } from '@/lib/college-brand';

/** Display roll number from profile metadata or student auth email local-part. */
export function rollNumberFromUser(
  email: string,
  metadata?: Record<string, unknown> | null,
): string {
  const meta = metadata ?? {};
  const saved = (meta.prep_profile ?? {}) as Record<string, unknown>;
  const fromMeta =
    (saved.roll_number as string | undefined) ??
    (meta.roll_number as string | undefined) ??
    (meta.rollNumber as string | undefined);
  if (fromMeta?.trim()) return fromMeta.trim();

  const local = email.split('@')[0]?.trim();
  if (!local) return '';
  const normalized = local.replace(/\s+/g, '').toUpperCase();
  if (email.toLowerCase().includes(`@student.${COLLEGE.emailDomain}`)) return normalized;
  return normalized;
}
