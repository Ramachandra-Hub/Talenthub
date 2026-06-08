import type { DbServiceClient } from '@/lib/db/get-db-service';
import { isElevateXModule } from '@/lib/elevatex';
import {
  resolveExamScheduleStatus,
  type ExamScheduleDisplayStatus,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { syncExpiredLiveExamSchedules } from '@/lib/exam-schedule-sync';
import { filterAttemptsForTest, type RollupAttempt } from '@/lib/admin/attempts-rollup';
import {
  loadAdminStudentsPrisma,
  loadAllAttemptsRollupPrisma,
} from '@/lib/admin/attempts-rollup-prisma';
import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import {
  filterRollupAttemptsForSchedule,
  latestAttemptPerUser,
  type ScheduleReportContext,
} from '@/lib/admin/schedule-report-filter';
export type AdminTestBucket = 'live' | 'upcoming' | 'ended';

export type DepartmentAttemptStat = {
  department: string;
  student_count: number;
};

export type AdminTestOverviewItem = {
  id: string;
  test_id: string | null;
  title: string;
  kind: 'faculty_schedule' | 'evalora_module' | 'faculty_published';
  kind_label: string;
  status: AdminTestBucket;
  status_label: string;
  departments: string[];
  years: string[];
  starts_at: string | null;
  ends_at: string | null;
  notice: string | null;
  description: string | null;
  duration_minutes: number | null;
  topic: string | null;
  slot_number: number | null;
  faculty_department: string | null;
  students_attempted: number;
  /** Unique students with an in-progress attempt (live exams). */
  students_writing: number;
  completed_attempts: number;
  total_attempts: number;
  departments_attempted: DepartmentAttemptStat[];
  avg_score: number | null;
};

export type AdminTestsOverviewPayload = {
  tests: AdminTestOverviewItem[];
  counts: { live: number; upcoming: number; ended: number; total: number };
};

type EvaloraScheduleRow = {
  id: string;
  module_key: string;
  title: string | null;
  notice: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  target_departments: string[];
  target_years: string[];
};

type FacultyRequestRow = {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  department: string;
  target_branches: string[];
  target_years: string[];
  duration_minutes: number;
  published_test_id: string | null;
  status: string;
};

function bucketFromDisplay(display: ExamScheduleDisplayStatus): AdminTestBucket {
  if (display === 'live') return 'live';
  if (display === 'scheduled') return 'upcoming';
  return 'ended';
}

function attemptStatsFromAttempts(
  related: RollupAttempt[],
  studentBranchByUserId: Map<string, string | null>,
): Pick<
  AdminTestOverviewItem,
  | 'students_attempted'
  | 'students_writing'
  | 'completed_attempts'
  | 'total_attempts'
  | 'departments_attempted'
  | 'avg_score'
> {
  const students = new Set<string>();
  const writingStudents = new Set<string>();
  const deptStudentSets = new Map<string, Set<string>>();
  let completed = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const attempt of related) {
    if (attempt.user_id) students.add(attempt.user_id);
    if (
      isInProgressStatus(attempt.status) &&
      !isCompletedAttemptStatus(attempt.status, attempt.completed_at)
    ) {
      writingStudents.add(attempt.user_id);
    }
    if (isCompletedAttemptStatus(attempt.status, attempt.completed_at)) {
      completed += 1;
      scoreSum += attempt.score;
      scoreCount += 1;
    }
  }

  for (const userId of students) {
    const branch = studentBranchByUserId.get(userId)?.trim() || 'Unknown department';
    if (!deptStudentSets.has(branch)) deptStudentSets.set(branch, new Set());
    deptStudentSets.get(branch)!.add(userId);
  }

  const departments_attempted = Array.from(deptStudentSets.entries())
    .map(([department, set]) => ({ department, student_count: set.size }))
    .sort((a, b) => b.student_count - a.student_count || a.department.localeCompare(b.department));

  return {
    students_attempted: students.size,
    students_writing: writingStudents.size,
    completed_attempts: completed,
    total_attempts: related.length,
    departments_attempted,
    avg_score: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null,
  };
}

function attemptStatsForTest(
  testId: string | null,
  attempts: RollupAttempt[],
  studentBranchByUserId: Map<string, string | null>,
): Pick<
  AdminTestOverviewItem,
  | 'students_attempted'
  | 'students_writing'
  | 'completed_attempts'
  | 'total_attempts'
  | 'departments_attempted'
  | 'avg_score'
> {
  if (!testId) {
    return {
      students_attempted: 0,
      students_writing: 0,
      completed_attempts: 0,
      total_attempts: 0,
      departments_attempted: [],
      avg_score: null,
    };
  }

  return attemptStatsFromAttempts(filterAttemptsForTest(attempts, testId), studentBranchByUserId);
}

function attemptStatsForScheduleWindow(
  testId: string | null,
  scheduleContext: ScheduleReportContext,
  attempts: RollupAttempt[],
  studentBranchByUserId: Map<string, string | null>,
): Pick<
  AdminTestOverviewItem,
  | 'students_attempted'
  | 'students_writing'
  | 'completed_attempts'
  | 'total_attempts'
  | 'departments_attempted'
  | 'avg_score'
> {
  if (!testId) {
    return {
      students_attempted: 0,
      students_writing: 0,
      completed_attempts: 0,
      total_attempts: 0,
      departments_attempted: [],
      avg_score: null,
    };
  }

  const byTest = filterAttemptsForTest(attempts, testId);
  const scoped = filterRollupAttemptsForSchedule(byTest, scheduleContext);
  return attemptStatsFromAttempts(latestAttemptPerUser(scoped), studentBranchByUserId);
}

function departmentsForFacultyRequest(row: FacultyRequestRow): string[] {
  return Array.from(new Set([row.department, ...(row.target_branches ?? [])].filter(Boolean)));
}

function sortTests(items: AdminTestOverviewItem[]): AdminTestOverviewItem[] {
  const order: Record<AdminTestBucket, number> = { live: 0, upcoming: 1, ended: 2 };
  return [...items].sort((a, b) => {
    const byStatus = order[a.status] - order[b.status];
    if (byStatus !== 0) return byStatus;
    const aStart = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const bStart = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    if (a.status === 'ended') return bStart - aStart;
    return aStart - bStart;
  });
}

export async function loadAdminTestsOverview(
  admin: DbServiceClient,
): Promise<AdminTestsOverviewPayload> {
  const now = Date.now();
  const items: AdminTestOverviewItem[] = [];

  const [{ attempts }, students] = await Promise.all([
    loadAllAttemptsRollupPrisma(),
    loadAdminStudentsPrisma(),
  ]);

  const studentBranchByUserId = new Map(students.map((s) => [s.id, s.branch]));

  const facultyById = new Map<string, FacultyRequestRow>();
  const { data: facultyRows } = await admin
    .from('faculty_exam_requests')
    .select(
      'id, title, description, topic, department, target_branches, target_years, duration_minutes, published_test_id, status',
    )
    .order('created_at', { ascending: false });

  for (const row of (facultyRows ?? []) as FacultyRequestRow[]) {
    facultyById.set(row.id, row);
  }

  let schedules = ((await admin
    .from('exam_schedules')
    .select('*')
    .order('starts_at', { ascending: false })).data ?? []) as ExamScheduleRow[];

  if (schedules.length) {
    schedules = await syncExpiredLiveExamSchedules(admin, schedules);
  }

  const facultyWithSchedule = new Set<string>();

  for (const schedule of schedules) {
    const resolved = resolveExamScheduleStatus(schedule, now);
    const status = bucketFromDisplay(resolved.display);
    const faculty = schedule.faculty_exam_request_id
      ? facultyById.get(schedule.faculty_exam_request_id)
      : undefined;

    if (schedule.faculty_exam_request_id) {
      facultyWithSchedule.add(schedule.faculty_exam_request_id);
    }

    const departments =
      (schedule.target_departments?.length ?? 0) > 0
        ? schedule.target_departments
        : faculty
          ? departmentsForFacultyRequest(faculty)
          : [];

    const testId = schedule.test_id ? String(schedule.test_id) : faculty?.published_test_id ?? null;
    const scheduleContext: ScheduleReportContext = {
      starts_at: schedule.starts_at,
      ends_at: schedule.ends_at,
      test_id: testId,
      title: schedule.title,
      faculty_title: faculty?.title ?? null,
    };

    items.push({
      id: `schedule:${schedule.id}`,
      test_id: testId,
      title: schedule.title,
      kind: 'faculty_schedule',
      kind_label: schedule.slot_number ? `Faculty exam · Slot ${schedule.slot_number}` : 'Faculty exam',
      status,
      status_label: resolved.label,
      departments,
      years: schedule.target_years ?? faculty?.target_years ?? [],
      starts_at: schedule.starts_at,
      ends_at: schedule.ends_at,
      notice: schedule.notice,
      description: schedule.description,
      duration_minutes: faculty?.duration_minutes ?? null,
      topic: faculty?.topic ?? null,
      slot_number: schedule.slot_number ?? null,
      faculty_department: faculty?.department ?? null,
      ...attemptStatsForScheduleWindow(testId, scheduleContext, attempts, studentBranchByUserId),
    });
  }

  const { data: evaloraRows } = await admin
    .from('evalora_module_schedules')
    .select('*')
    .order('starts_at', { ascending: false });

  for (const row of (evaloraRows ?? []) as EvaloraScheduleRow[]) {
    const pseudoSchedule = {
      status: row.status as ExamScheduleRow['status'],
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    };
    const resolved = resolveExamScheduleStatus(pseudoSchedule, now);
    const status = bucketFromDisplay(resolved.display);
    const elevatex = isElevateXModule(row.module_key);
    const testId = elevatex ? row.module_key : row.module_key;
    const scheduleContext: ScheduleReportContext = {
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      test_id: testId,
      title: row.title ?? (elevatex ? 'ElevateX' : row.module_key),
      faculty_title: null,
    };

    items.push({
      id: `evalora:${row.id}`,
      test_id: testId,
      title: row.title ?? (elevatex ? 'ElevateX' : row.module_key),
      kind: 'evalora_module',
      kind_label: elevatex ? 'ElevateX' : 'Evalora module',
      status,
      status_label: resolved.label,
      departments: row.target_departments?.length ? row.target_departments : ['All departments'],
      years: row.target_years?.length ? row.target_years : ['All years'],
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      notice: row.notice,
      description: null,
      duration_minutes: elevatex ? 60 : null,
      topic: null,
      slot_number: null,
      faculty_department: null,
      ...attemptStatsForScheduleWindow(testId, scheduleContext, attempts, studentBranchByUserId),
    });
  }

  for (const faculty of facultyById.values()) {
    if (faculty.status !== 'approved' || !faculty.published_test_id) continue;
    if (facultyWithSchedule.has(faculty.id)) continue;

    const testId = String(faculty.published_test_id);
    items.push({
      id: `faculty:${faculty.id}`,
      test_id: testId,
      title: faculty.title,
      kind: 'faculty_published',
      kind_label: 'Faculty exam (not scheduled)',
      status: 'upcoming',
      status_label: 'Approved · awaiting schedule',
      students_writing: 0,
      departments: departmentsForFacultyRequest(faculty),
      years: faculty.target_years ?? [],
      starts_at: null,
      ends_at: null,
      notice: null,
      description: faculty.description,
      duration_minutes: faculty.duration_minutes,
      topic: faculty.topic,
      slot_number: null,
      faculty_department: faculty.department,
      ...attemptStatsForTest(testId, attempts, studentBranchByUserId),
    });
  }

  const tests = sortTests(items);
  const counts = {
    live: tests.filter((t) => t.status === 'live').length,
    upcoming: tests.filter((t) => t.status === 'upcoming').length,
    ended: tests.filter((t) => t.status === 'ended').length,
    total: tests.length,
  };

  return { tests, counts };
}
