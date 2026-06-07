import type { DbServiceClient } from '@/lib/db/get-db-service';
import {
  isScheduleWindowOpen,
  scheduleMatchesStudent,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { checkStudentSlotExamAccess } from '@/lib/exam-schedule-slots';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { testIdsMatch } from '@/lib/test-attempts';

export type ExamAccessResult =
  | { allowed: true; schedule: ExamScheduleRow | null }
  | {
      allowed: false;
      code: 'NOT_LIVE' | 'TARGET_MISMATCH' | 'SLOT_NOT_ASSIGNED' | 'SLOT_WRONG_WINDOW';
      message: string;
      schedule: ExamScheduleRow | null;
    };

async function schedulesForTest(
  admin: DbServiceClient,
  testId: string,
): Promise<ExamScheduleRow[]> {
  const { data, error } = await admin.from('exam_schedules').select('*');
  if (error) return [];
  return ((data ?? []) as ExamScheduleRow[]).filter((s) =>
    testIdsMatch(s.test_id, testId),
  );
}

/** Decide if a logged-in student may take this test (schedule window + targeting + slot roster). */
export async function checkStudentExamAccess(
  admin: DbServiceClient,
  input: {
    testId: string;
    department: string;
    year: string;
    rollNumber?: string;
    email?: string | null;
    metadata?: Record<string, unknown> | null;
    now?: number;
  },
): Promise<ExamAccessResult> {
  const testId = input.testId.trim();
  const schedules = await schedulesForTest(admin, testId);

  if (schedules.length === 0) {
    const id = testId.trim().toLowerCase();
    if (id.startsWith('fallback-') || id === 'fallback-competitive-all-india-v1') {
      return { allowed: true, schedule: null };
    }
    return {
      allowed: false,
      code: 'NOT_LIVE',
      message:
        'This examination has not been scheduled yet. Contact the examination cell or your faculty.',
      schedule: null,
    };
  }

  const facultyRequestId = schedules.find((s) => s.faculty_exam_request_id)?.faculty_exam_request_id;
  if (facultyRequestId) {
    const { data: reqRow } = await admin
      .from('faculty_exam_requests')
      .select('uses_slot_scheduling')
      .eq('id', facultyRequestId)
      .maybeSingle();

    if (reqRow?.uses_slot_scheduling) {
      const roll =
        input.rollNumber?.trim() ||
        rollNumberFromUser(input.email ?? '', input.metadata ?? null);
      const slotResult = await checkStudentSlotExamAccess(admin, {
        schedules,
        facultyExamRequestId: facultyRequestId,
        rollNumber: roll,
        email: input.email,
        metadata: input.metadata,
        department: input.department,
        year: input.year,
        now: input.now,
      });
      if (!slotResult.allowed) {
        return {
          allowed: false,
          code: slotResult.code,
          message: slotResult.message,
          schedule: slotResult.schedule,
        };
      }
      return { allowed: true, schedule: slotResult.schedule };
    }
  }

  const now = input.now ?? Date.now();
  const liveSchedules = schedules.filter((s) => isScheduleWindowOpen(s, now));

  if (liveSchedules.length === 0) {
    const upcoming = schedules.some((s) => s.status === 'scheduled');
    return {
      allowed: false,
      code: 'NOT_LIVE',
      message: upcoming
        ? 'This examination is not live yet. Check your dashboard for the start time.'
        : 'This examination is not available right now.',
      schedule: schedules[0] ?? null,
    };
  }

  const schedule =
    liveSchedules.find((s) => scheduleMatchesStudent(s, input.department, input.year)) ??
    liveSchedules[0];

  if (!scheduleMatchesStudent(schedule, input.department, input.year)) {
    return {
      allowed: false,
      code: 'TARGET_MISMATCH',
      message:
        'This examination is not scheduled for your department or academic year.',
      schedule,
    };
  }

  return { allowed: true, schedule };
}

export async function assertStudentCanTakeTest(
  admin: DbServiceClient,
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
  testId: string,
  profile: { branch: string | null; academic_year: string | null },
): Promise<ExamAccessResult> {
  const roll = rollNumberFromUser(user.email ?? '', user.user_metadata ?? null);

  return checkStudentExamAccess(admin, {
    testId,
    department: profile.branch ?? '',
    year: profile.academic_year ?? '',
    rollNumber: roll,
    email: user.email,
    metadata: user.user_metadata ?? null,
  });
}
