import { classifyExamAttempt, type AdminExamType } from '@/lib/admin/exam-type';
import { reportFiltersForTestOverview } from '@/lib/admin/test-overview-report';
import type { AdminTestOverviewItem } from '@/lib/admin/tests-overview-data';
import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import { averageScorePercent, roundRatePercent, roundScorePercent } from '@/lib/format-score';
import type { TestReportRow, TestReportsPayload } from '@/lib/admin/test-reports-data';
import { sortTestReportRows } from '@/lib/admin/schedule-report-filter';

export function isDashboardOverviewTest(test: AdminTestOverviewItem): boolean {
  return test.id.startsWith('dashboard:');
}

export function reportFiltersForDashboardTest(input: {
  testId: string;
  testName: string;
  categorySlug?: string;
}): { examType: AdminExamType; testId: string; scheduleId: undefined } {
  return { examType: 'all', testId: input.testId, scheduleId: undefined };
}

export function resolveReportFiltersForOverview(test: AdminTestOverviewItem): {
  examType: AdminExamType;
  testId: string | undefined;
  scheduleId: string | undefined;
} {
  if (isDashboardOverviewTest(test)) {
    return reportFiltersForDashboardTest({
      testId: test.test_id ?? '',
      testName: test.title,
      categorySlug: test.topic ?? undefined,
    });
  }
  return reportFiltersForTestOverview(test);
}

/** Synthetic overview row for admin dashboard test-wise performance clicks. */
export function buildDashboardTestOverviewItem(row: {
  testId: string;
  testName: string;
  attempts: number;
  avgScore: number;
  categorySlug?: string;
}): AdminTestOverviewItem {
  return {
    id: `dashboard:${row.testId}`,
    test_id: row.testId,
    title: row.testName,
    kind: 'faculty_published',
    kind_label: 'Test',
    status: 'ended',
    status_label: 'Dashboard view',
    departments: [],
    years: [],
    starts_at: null,
    ends_at: null,
    notice: null,
    description: null,
    duration_minutes: null,
    topic: row.categorySlug ?? null,
    slot_number: null,
    faculty_department: null,
    students_attempted: row.attempts,
    completed_attempts: row.attempts,
    total_attempts: row.attempts,
    departments_attempted: [],
    avg_score: row.avgScore,
  };
}

type DashboardAttemptInput = {
  id: string | number;
  user_id?: string;
  test_id?: string | number | null;
  test_name?: string;
  score?: number | null;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  time_taken?: number | null;
};

type DashboardStudentInput = {
  id: string;
  email: string;
  full_name: string | null;
  roll_number?: string;
  branch?: string | null;
  academic_year?: string | null;
};

/** Build test report rows from dashboard data (avoids API mismatch with scoped filters). */
export function buildDashboardTestReportPayload(input: {
  testId: string;
  testName: string;
  categorySlug?: string;
  attempts: DashboardAttemptInput[];
  students: DashboardStudentInput[];
}): TestReportsPayload {
  const studentById = new Map(input.students.map((s) => [s.id, s]));
  const examType = classifyExamAttempt({
    test_id: input.testId,
    test_name: input.testName,
    category_slug: input.categorySlug ?? '',
  });

  const rows: TestReportRow[] = sortTestReportRows(
    input.attempts.map((a) => {
      const student = studentById.get(String(a.user_id ?? ''));
      return {
        attempt_id: String(a.id),
        user_id: String(a.user_id ?? ''),
        student_name: student?.full_name?.trim() || student?.email || 'Student',
        email: student?.email ?? '',
        roll_number: student?.roll_number ?? '',
        branch: student?.branch ?? null,
        academic_year: student?.academic_year ?? null,
        test_id: input.testId,
        test_name: a.test_name || input.testName,
        exam_type: examType,
        score: roundScorePercent(Number(a.score ?? 0)),
        status: String(a.status ?? 'completed'),
        completed_at: a.completed_at ? String(a.completed_at) : null,
        created_at: a.created_at ? String(a.created_at) : new Date().toISOString(),
        time_taken_sec: a.time_taken != null ? Number(a.time_taken) : null,
      };
    }),
  );

  const completedRows = rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at));
  const inProgressCount = rows.filter(
    (r) => isInProgressStatus(r.status) && !r.completed_at,
  ).length;
  const scores = completedRows.map((r) => r.score);
  const uniqueStudents = new Set(rows.map((r) => r.user_id)).size;
  const passed = scores.filter((s) => s >= 40).length;

  return {
    exam_type: examType,
    summary: {
      total_attempts: rows.length,
      in_progress_count: inProgressCount,
      completed_count: completedRows.length,
      unique_students: uniqueStudents,
      avg_score: scores.length > 0 ? averageScorePercent(scores) : 0,
      pass_rate: scores.length > 0 ? roundRatePercent((passed / scores.length) * 100) : 0,
      highest_score: scores.length > 0 ? roundScorePercent(Math.max(...scores)) : 0,
    },
    tests: [{ id: input.testId, name: input.testName, attempt_count: rows.length }],
    rows,
  };
}
