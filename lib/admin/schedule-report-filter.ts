import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import type { RollupAttempt } from '@/lib/admin/attempts-rollup';
import { isElevateXAttemptTitle, isElevateXModule, isElevateXTestId } from '@/lib/elevatex';
import { testIdsMatch } from '@/lib/test-attempts';
import type { TestReportRow } from '@/lib/admin/test-reports-data';

export type ScheduleReportContext = {
  starts_at: string;
  ends_at: string | null;
  test_id: string | null;
  title: string;
  faculty_title?: string | null;
};

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/^department\s*·\s*/i, '')
    .trim();
}

function titleKeysForSchedule(ctx: ScheduleReportContext): string[] {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const n = normalizeTitle(String(value ?? ''));
    if (n) keys.add(n);
  };
  add(ctx.title);
  add(ctx.faculty_title);
  if (ctx.faculty_title) add(`department · ${ctx.faculty_title}`);
  return Array.from(keys);
}

export function scheduleSessionBounds(ctx: Pick<ScheduleReportContext, 'starts_at' | 'ends_at'>): {
  startMs: number;
  endMs: number | null;
} {
  const startMs = new Date(ctx.starts_at).getTime();
  const endMs = ctx.ends_at ? new Date(ctx.ends_at).getTime() : null;
  return {
    startMs: Number.isNaN(startMs) ? 0 : startMs,
    endMs: endMs !== null && !Number.isNaN(endMs) ? endMs : null,
  };
}

/** Attempt must fall within this scheduled slot window — not older runs of the same test. */
export function attemptInScheduleWindow(
  attempt: RollupAttempt,
  ctx: Pick<ScheduleReportContext, 'starts_at' | 'ends_at'>,
): boolean {
  const { startMs, endMs } = scheduleSessionBounds(ctx);
  const attemptMs = new Date(attempt.created_at).getTime();
  if (Number.isNaN(attemptMs)) return false;
  if (attemptMs < startMs - 60_000) return false;
  if (endMs !== null && attemptMs > endMs + 120_000) return false;
  return true;
}

export function attemptMatchesScheduleReport(
  attempt: RollupAttempt,
  ctx: ScheduleReportContext,
): boolean {
  if (!attemptInScheduleWindow(attempt, ctx)) return false;

  const scheduleTestId = String(ctx.test_id ?? '').trim();
  const titleKeys = titleKeysForSchedule(ctx);

  if (scheduleTestId && attempt.test_id && testIdsMatch(attempt.test_id, scheduleTestId)) {
    return true;
  }

  if (isElevateXModule(scheduleTestId) || isElevateXTestId(scheduleTestId)) {
    if (attempt.test_id && isElevateXTestId(attempt.test_id)) return true;
    if (isElevateXAttemptTitle(attempt.test_name)) return true;
  }

  const attemptTitle = normalizeTitle(attempt.test_name);
  if (!attemptTitle) return false;

  for (const key of titleKeys) {
    if (!key) continue;
    if (attemptTitle === key) return true;
    if (attemptTitle.includes(key) || key.includes(attemptTitle)) return true;
  }

  return false;
}

export function filterRollupAttemptsForSchedule(
  attempts: RollupAttempt[],
  ctx: ScheduleReportContext,
): RollupAttempt[] {
  return attempts.filter((attempt) => attemptMatchesScheduleReport(attempt, ctx));
}

export function bestAttemptPerUser(attempts: RollupAttempt[]): RollupAttempt[] {
  const byUser = new Map<string, RollupAttempt>();
  for (const attempt of attempts) {
    const existing = byUser.get(attempt.user_id);
    if (!existing) {
      byUser.set(attempt.user_id, attempt);
      continue;
    }
    if (attempt.score > existing.score) {
      byUser.set(attempt.user_id, attempt);
      continue;
    }
    if (attempt.score === existing.score) {
      const attemptMs = new Date(attempt.completed_at ?? attempt.created_at).getTime();
      const existingMs = new Date(existing.completed_at ?? existing.created_at).getTime();
      if (attemptMs < existingMs) byUser.set(attempt.user_id, attempt);
    }
  }
  return Array.from(byUser.values());
}

export function latestAttemptPerUser(attempts: RollupAttempt[]): RollupAttempt[] {
  const byUser = new Map<string, RollupAttempt>();
  for (const attempt of attempts) {
    const existing = byUser.get(attempt.user_id);
    if (!existing) {
      byUser.set(attempt.user_id, attempt);
      continue;
    }
    const existingMs = new Date(existing.created_at).getTime();
    const attemptMs = new Date(attempt.created_at).getTime();
    if (attemptMs >= existingMs) byUser.set(attempt.user_id, attempt);
  }
  return Array.from(byUser.values());
}

export function sortTestReportRows(rows: TestReportRow[]): TestReportRow[] {
  const sorted = [...rows].sort((a, b) => {
    const aDone = isCompletedAttemptStatus(a.status, a.completed_at);
    const bDone = isCompletedAttemptStatus(b.status, b.completed_at);
    if (aDone !== bDone) return aDone ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (aDone && bDone && a.completed_at && b.completed_at) {
      return new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime();
    }
    return a.student_name.localeCompare(b.student_name);
  });

  let rank = 0;
  return sorted.map((row) => {
    const done = isCompletedAttemptStatus(row.status, row.completed_at);
    const inProgress = isInProgressStatus(row.status) && !row.completed_at;
    if (done || inProgress) rank += 1;
    return { ...row, rank: rank > 0 ? rank : undefined };
  });
}
