import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { scheduleEndMs, scheduleStartMs } from '@/lib/exam-schedule';

/** Attempt belongs to this scheduled exam session (not a prior ElevateX run). */
export function attemptInLiveExamSession(
  attempt: { created_at: string; completed_at?: string | null },
  schedule: ExamScheduleRow,
  now = Date.now(),
): boolean {
  const startMs = scheduleStartMs(schedule.starts_at);
  const endMs = scheduleEndMs(schedule.ends_at);
  const createdMs = new Date(attempt.created_at).getTime();
  const eventMs = new Date(attempt.completed_at ?? attempt.created_at).getTime();

  if (Number.isNaN(createdMs) || Number.isNaN(eventMs)) return false;
  if (createdMs < startMs - 2 * 60 * 1000) return false;
  if (endMs !== null && eventMs > endMs + 15 * 60 * 1000) return false;
  if (endMs !== null && now > endMs + 15 * 60 * 1000 && createdMs < startMs) return false;

  return true;
}

export function liveSessionSince(schedule: ExamScheduleRow): Date {
  return new Date(scheduleStartMs(schedule.starts_at));
}
