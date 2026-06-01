import { academicYearInList } from '@/lib/academic-year-match';
import { targetDepartmentsMatchStudent } from '@/lib/department-match';
import { parseTargetStringArray } from '@/lib/targeting-parse';
import { studentTakeUrlForTestId } from '@/lib/exam-builder/elevatex-exam';

export type ExamScheduleStatus = 'scheduled' | 'live' | 'ended';

/** What admins and students should see — may differ from raw DB status when the time window closed. */
export type ExamScheduleDisplayStatus =
  | 'scheduled'
  | 'live'
  | 'ended'
  | 'window_ended';

export type ResolvedExamScheduleStatus = {
  display: ExamScheduleDisplayStatus;
  label: string;
  /** True when students may take the exam (status live + inside start/end window). */
  windowOpen: boolean;
};

export type ExamScheduleRow = {
  id: string;
  title: string;
  description: string | null;
  notice: string | null;
  faculty_exam_request_id: string | null;
  test_id: string;
  status: ExamScheduleStatus;
  starts_at: string;
  ends_at: string | null;
  target_departments: string[];
  target_years: string[];
  slot_number?: number | null;
  slot_capacity?: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentExamSchedule = ExamScheduleRow & {
  kind: 'live' | 'upcoming';
  take_url: string;
  duration_minutes?: number | null;
  topic?: string | null;
};

export function scheduleMatchesStudent(
  schedule: Pick<ExamScheduleRow, 'target_departments' | 'target_years'>,
  department: string,
  year: string,
): boolean {
  const years = parseTargetStringArray(schedule.target_years);
  if (years.length > 0 && !academicYearInList(year, years)) return false;
  return targetDepartmentsMatchStudent(schedule.target_departments, department);
}

/** Slot roster students: year rules apply; department comes from the roster, not schedule targeting. */
export function scheduleMatchesRosterSlotStudent(
  schedule: Pick<ExamScheduleRow, 'target_years'>,
  year: string,
): boolean {
  const years = parseTargetStringArray(schedule.target_years);
  if (years.length === 0) return true;
  return academicYearInList(year, years);
}

export function scheduleEndMs(endsAt: string | null | undefined): number | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  return Number.isNaN(end) ? null : end;
}

export function scheduleStartMs(startsAt: string): number {
  const start = new Date(startsAt).getTime();
  return Number.isNaN(start) ? 0 : start;
}

export function isScheduleWindowOpen(
  schedule: Pick<ExamScheduleRow, 'status' | 'starts_at' | 'ends_at'>,
  now = Date.now(),
): boolean {
  if (schedule.status !== 'live') return false;
  const start = scheduleStartMs(schedule.starts_at);
  if (start > now) return false;
  const end = scheduleEndMs(schedule.ends_at);
  if (end !== null && now > end) return false;
  return true;
}

/** @deprecated Alias for isScheduleWindowOpen */
export function isScheduleLiveNow(
  schedule: Pick<ExamScheduleRow, 'status' | 'starts_at' | 'ends_at'>,
  now = Date.now(),
): boolean {
  return isScheduleWindowOpen(schedule, now);
}

export function resolveExamScheduleStatus(
  schedule: Pick<ExamScheduleRow, 'status' | 'starts_at' | 'ends_at'>,
  now = Date.now(),
): ResolvedExamScheduleStatus {
  if (schedule.status === 'ended') {
    return { display: 'ended', label: 'Ended', windowOpen: false };
  }

  if (schedule.status === 'live') {
    if (isScheduleWindowOpen(schedule, now)) {
      return { display: 'live', label: 'Live', windowOpen: true };
    }
    const end = scheduleEndMs(schedule.ends_at);
    if (end !== null && now > end) {
      return {
        display: 'window_ended',
        label: 'Ended (time window closed)',
        windowOpen: false,
      };
    }
    const start = scheduleStartMs(schedule.starts_at);
    if (start > now) {
      return { display: 'scheduled', label: 'Scheduled (not started)', windowOpen: false };
    }
    return { display: 'window_ended', label: 'Ended (time window closed)', windowOpen: false };
  }

  const start = scheduleStartMs(schedule.starts_at);
  if (start > now) {
    return { display: 'scheduled', label: 'Scheduled', windowOpen: false };
  }

  return { display: 'scheduled', label: 'Scheduled', windowOpen: false };
}

/** Clear ends_at on go-live when it is before the new start (common admin workflow bug). */
export function normalizeEndsAtForGoLive(
  startsAtIso: string,
  endsAt: string | null | undefined,
): string | null {
  if (!endsAt) return null;
  const start = new Date(startsAtIso).getTime();
  const end = scheduleEndMs(endsAt);
  if (end === null) return null;
  if (end <= start) return null;
  return endsAt;
}

export function isScheduleUpcoming(
  schedule: Pick<ExamScheduleRow, 'status' | 'starts_at'>,
  now = Date.now(),
): boolean {
  if (schedule.status === 'ended') return false;
  const start = scheduleStartMs(schedule.starts_at);
  if (start <= now) return false;
  return schedule.status === 'scheduled' || schedule.status === 'live';
}

export function partitionSchedulesForStudent(
  rows: ExamScheduleRow[],
  department: string,
  year: string,
  extras?: Map<string, { duration_minutes?: number; topic?: string | null }>,
  rosterAssignedRequestIds?: Set<string>,
): { live: StudentExamSchedule[]; upcoming: StudentExamSchedule[] } {
  const now = Date.now();
  const live: StudentExamSchedule[] = [];
  const upcoming: StudentExamSchedule[] = [];

  for (const row of rows) {
    const reqId = row.faculty_exam_request_id;
    const onSlotRoster = reqId != null && rosterAssignedRequestIds?.has(reqId);
    const matches = onSlotRoster
      ? scheduleMatchesRosterSlotStudent(row, year)
      : scheduleMatchesStudent(row, department, year);
    if (!matches) continue;

    const meta = row.faculty_exam_request_id
      ? extras?.get(row.faculty_exam_request_id)
      : undefined;

    const base: StudentExamSchedule = {
      ...row,
      kind: 'live',
      take_url: studentTakeUrlForTestId(String(row.test_id)),
      duration_minutes: meta?.duration_minutes ?? null,
      topic: meta?.topic ?? null,
    };

    if (isScheduleLiveNow(row, now)) {
      live.push({ ...base, kind: 'live' });
    } else if (isScheduleUpcoming(row, now)) {
      upcoming.push({ ...base, kind: 'upcoming' });
    }
  }

  live.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  upcoming.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return { live, upcoming };
}

/** If a faculty exam has a schedule row, it is only accessible when live. */
export function facultyExamIdsGatedBySchedule(schedules: ExamScheduleRow[]): Set<string> {
  const ids = new Set<string>();
  for (const s of schedules) {
    if (s.faculty_exam_request_id) ids.add(s.faculty_exam_request_id);
  }
  return ids;
}

export function isFacultyExamLiveForStudent(
  facultyExamRequestId: string,
  schedules: ExamScheduleRow[],
  department: string,
  year: string,
): boolean {
  const related = schedules.filter((s) => s.faculty_exam_request_id === facultyExamRequestId);
  if (related.length === 0) return true;
  return related.some(
    (s) => scheduleMatchesStudent(s, department, year) && isScheduleLiveNow(s),
  );
}
