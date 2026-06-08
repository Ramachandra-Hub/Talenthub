import { prisma } from '@/lib/prisma';
import { isElevateXTestId } from '@/lib/elevatex';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidTestId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Sync resolve — no RDS round-trip (submit hot path). FK errors fall back to null test_id. */
export function resolveTestIdForInsertSync(testId: string): string | null {
  const t = testId.trim();
  if (!t || t.startsWith('fallback-') || t === 'programming-assessment-v1' || isElevateXTestId(t)) {
    return null;
  }
  return isUuidTestId(t) ? t : null;
}

/**
 * test_attempts.test_id is a UUID FK — ElevateX uses `placement_full` (store null + test_title).
 */
export async function resolveTestIdForInsertPrisma(testId: string): Promise<string | null> {
  const t = testId.trim();
  if (!t || t.startsWith('fallback-') || t === 'programming-assessment-v1' || isElevateXTestId(t)) {
    return null;
  }
  if (!isUuidTestId(t)) return null;
  const exists = await prisma.test.findUnique({ where: { id: t }, select: { id: true } });
  return exists ? t : null;
}
