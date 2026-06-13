import type { DbServiceClient } from '@/lib/db/get-db-service';
import { scheduleEndMs, type ExamScheduleRow } from '@/lib/exam-schedule';
import {
  finalizeOpenAttemptsForScheduleIdsPrisma,
  syncExpiredSchedulesAndFinalizeAttemptsPrisma,
} from '@/lib/exam-schedule-slot-finalize';

/** True when a live schedule's end time has passed (do not treat "not started yet" as expired). */
export function isSchedulePastEnd(
  schedule: Pick<ExamScheduleRow, 'ends_at'>,
  now = Date.now(),
): boolean {
  const end = scheduleEndMs(schedule.ends_at);
  return end !== null && now > end;
}

/**
 * Persist status=ended when a live row's ends_at has passed so the DB matches the time window.
 */
export async function syncExpiredLiveExamSchedules(
  admin: DbServiceClient,
  schedules: ExamScheduleRow[],
  now = Date.now(),
): Promise<ExamScheduleRow[]> {
  const expired = schedules.filter(
    (s) => s.status === 'live' && isSchedulePastEnd(s, now),
  );

  if (expired.length === 0) return schedules;

  const ids = expired.map((s) => s.id);
  const { error } = await admin
    .from('exam_schedules')
    .update({
      status: 'ended',
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (error) {
    console.warn('[exam-schedules] syncExpiredLiveExamSchedules:', error.message);
    return schedules;
  }

  void finalizeOpenAttemptsForScheduleIdsPrisma(ids).catch(() => undefined);

  const endedIds = new Set(ids);
  return schedules.map((s) =>
    endedIds.has(s.id) ? { ...s, status: 'ended' as const } : s,
  );
}

/** Mark live exam_schedules past ends_at as ended (Prisma path — used by live dashboard). */
export async function syncExpiredLiveExamSchedulesPrisma(now = Date.now()): Promise<void> {
  await syncExpiredSchedulesAndFinalizeAttemptsPrisma(now).catch((err) => {
    console.warn(
      '[exam-schedules] syncExpiredLiveExamSchedulesPrisma:',
      err instanceof Error ? err.message : err,
    );
  });
}

/** Admin or manual end — finalize every open attempt tied to this slot. */
export async function finalizeAttemptsForEndedSchedulePrisma(
  scheduleId: string,
  now = new Date(),
): Promise<number> {
  return finalizeOpenAttemptsForScheduleIdsPrisma([scheduleId], now);
}
