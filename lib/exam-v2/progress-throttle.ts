import { isElevateXTestId } from '@/lib/elevatex';

const ELEVATEX_MIN_WRITE_MS = 8_000;
const DEFAULT_MIN_WRITE_MS = 10_000;

type WriteRecord = {
  lastWriteMs: number;
  lastAttemptId: string | null;
  lastScorePercent: number | null;
  lastStartedAtIso: string | null;
};

const writes = new Map<string, WriteRecord>();

function key(userId: string, testId: string): string {
  return `${userId}:${testId.trim()}`;
}

function minIntervalMs(testId: string): number {
  return isElevateXTestId(testId) ? ELEVATEX_MIN_WRITE_MS : DEFAULT_MIN_WRITE_MS;
}

export type ProgressThrottleResult =
  | { persist: true }
  | {
      persist: false;
      attemptId: string | null;
      startedAtIso: string | null;
      scorePercent: number | null;
    };

/** Coalesce rapid progress POSTs so 500 students do not hammer RDS on every keystroke. */
export function shouldPersistExamProgress(
  userId: string,
  testId: string,
  attemptId?: string,
): ProgressThrottleResult {
  const k = key(userId, testId);
  const now = Date.now();
  const prev = writes.get(k);

  if (prev && now - prev.lastWriteMs < minIntervalMs(testId)) {
    return {
      persist: false,
      attemptId: attemptId ?? prev.lastAttemptId,
      startedAtIso: prev.lastStartedAtIso,
      scorePercent: prev.lastScorePercent,
    };
  }

  return { persist: true };
}

export function recordExamProgressWrite(input: {
  userId: string;
  testId: string;
  attemptId: string;
  startedAtIso: string;
  scorePercent: number;
}): void {
  writes.set(key(input.userId, input.testId), {
    lastWriteMs: Date.now(),
    lastAttemptId: input.attemptId,
    lastStartedAtIso: input.startedAtIso,
    lastScorePercent: input.scorePercent,
  });
}
