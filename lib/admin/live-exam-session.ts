import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { scheduleEndMs, scheduleStartMs } from '@/lib/exam-schedule';

const SESSION_START_GRACE_MS = 2 * 60 * 1000;
const SESSION_END_GRACE_MS = 15 * 60 * 1000;

/** Attempt belongs to this scheduled exam session (not a prior ElevateX run). */
export function attemptInLiveExamSession(
  attempt: { created_at: string; completed_at?: string | null },
  schedule: ExamScheduleRow,
  now = Date.now(),
): boolean {
  const startMs = scheduleStartMs(schedule.starts_at);
  const endMs = scheduleEndMs(schedule.ends_at);
  const createdMs = new Date(attempt.created_at).getTime();
  const completedMs = attempt.completed_at ? new Date(attempt.completed_at).getTime() : NaN;

  if (Number.isNaN(createdMs)) return false;

  // Submit during this live window counts even if autosave row was created before go-live.
  if (!Number.isNaN(completedMs)) {
    if (completedMs >= startMs - SESSION_START_GRACE_MS) {
      if (endMs === null || completedMs <= endMs + SESSION_END_GRACE_MS) return true;
    }
  }

  if (createdMs < startMs - SESSION_START_GRACE_MS) return false;
  const eventMs = Number.isNaN(completedMs) ? createdMs : completedMs;
  if (endMs !== null && eventMs > endMs + SESSION_END_GRACE_MS) return false;
  if (endMs !== null && now > endMs + SESSION_END_GRACE_MS && createdMs < startMs) return false;

  return true;
}

export function liveSessionSince(schedule: ExamScheduleRow): Date {
  return new Date(scheduleStartMs(schedule.starts_at));
}
