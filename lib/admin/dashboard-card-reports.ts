import { formatAttemptStatus } from '@/lib/attempt-status';
import { formatScorePercentLabel } from '@/lib/format-score';
import type { TableReportPayload } from '@/lib/reports/table-report';

export type AdminDashboardCardKey =
  | 'registered_users'
  | 'students_with_attempts'
  | 'tests_submitted'
  | 'avg_tests_per_student'
  | 'tests_last_7_days'
  | 'low_performers'
  | 'psychometric'
  | 'attendance_rate'
  | 'overall_average'
  | 'pass_rate'
  | 'inactive_students';

export type AdminDashboardStudent = {
  id: string;
  email: string;
  full_name: string | null;
  roll_number?: string;
  branch?: string | null;
  academic_year?: string | null;
  attempts: number;
  avgScore: number;
  highestScore: number;
  highestTestName: string | null;
  latestAttemptAt: string | null;
};

export type AdminDashboardAttempt = {
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

export type AdminDashboardReportContext = {
  stats: {
    totalRegisteredUsers: number;
    totalStudentsAttended: number;
    totalTestsSubmitted: number;
    avgTestsPerStudent: number;
    testsLast7Days: number;
    lowPerformers: number;
    psychometricSubmitted: number;
  };
  students: AdminDashboardStudent[];
  attempts: AdminDashboardAttempt[];
  categories: Array<{ id: string; name: string; slug: string }>;
  categorySlugByTestId: Map<string, string>;
  categoryNameByTestId: Map<string, string>;
  testsMap: Map<string, { name: string; category_id: string }>;
  attendanceRate: number;
  overallAverageScore: number;
  passRate: number;
  passedCount: number;
  inactiveCount: number;
};

const ATTEMPT_COLUMNS = [
  { key: 'student_name', header: 'Student' },
  { key: 'roll_number', header: 'Roll no.' },
  { key: 'email', header: 'Email' },
  { key: 'branch', header: 'Branch' },
  { key: 'test_name', header: 'Test' },
  { key: 'category', header: 'Category' },
  { key: 'score', header: 'Score %', align: 'right' as const },
  { key: 'status', header: 'Status' },
  { key: 'started_at', header: 'Started' },
  { key: 'completed_at', header: 'Completed' },
  { key: 'time_min', header: 'Time (min)', align: 'right' as const },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function studentRows(
  students: AdminDashboardStudent[],
  mapRow: (s: AdminDashboardStudent) => Record<string, string | number>,
) {
  return students.map(mapRow);
}

function attemptRows(
  ctx: AdminDashboardReportContext,
  filter: (a: AdminDashboardAttempt, slug: string) => boolean,
): Array<Record<string, string | number>> {
  const byId = new Map(ctx.students.map((s) => [s.id, s]));
  return ctx.attempts
    .filter((a) => {
      const testId = String(a.test_id ?? '');
      const slug = ctx.categorySlugByTestId.get(testId) ?? '';
      return filter(a, slug);
    })
    .map((a) => {
      const student = byId.get(String(a.user_id ?? ''));
      const testId = String(a.test_id ?? '');
      const test = ctx.testsMap.get(testId);
      return {
        student_name: student?.full_name || student?.email || 'Student',
        roll_number: student?.roll_number || '—',
        email: student?.email || '—',
        branch: student?.branch || '—',
        test_name: a.test_name || test?.name || `Test ${testId}`,
        category: ctx.categoryNameByTestId.get(testId) || '—',
        score: formatScorePercentLabel(Number(a.score ?? 0)),
        status: formatAttemptStatus(a.status),
        started_at: fmtDate(a.created_at),
        completed_at: fmtDate(a.completed_at),
        time_min:
          a.time_taken != null ? Math.max(1, Math.round(Number(a.time_taken) / 60)) : '—',
      };
    });
}

function basePayload(
  title: string,
  subtitle: string,
  summaryLines: string[],
  columns: typeof ATTEMPT_COLUMNS,
  rows: Array<Record<string, string | number>>,
): TableReportPayload {
  return {
    title,
    subtitle,
    generatedAt: new Date().toLocaleString(),
    summaryLines,
    columns,
    rows,
  };
}

export function buildAdminDashboardCardReport(
  key: AdminDashboardCardKey,
  ctx: AdminDashboardReportContext,
): TableReportPayload | null {
  const generated = new Date().toLocaleString();

  switch (key) {
    case 'registered_users':
      return {
        title: 'Registered users',
        subtitle: 'Ramachandra College — all student accounts',
        generatedAt: generated,
        summaryLines: [
          `Total registered: ${ctx.stats.totalRegisteredUsers}`,
          `With at least one attempt: ${ctx.stats.totalStudentsAttended}`,
          `Inactive (no attempts): ${ctx.inactiveCount}`,
        ],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'email', header: 'Email' },
          { key: 'roll', header: 'Roll no.' },
          { key: 'branch', header: 'Branch' },
          { key: 'year', header: 'Year' },
          { key: 'attempts', header: 'Attempts', align: 'right' },
          { key: 'avg', header: 'Avg score %', align: 'right' },
          { key: 'latest', header: 'Latest activity' },
        ],
        rows: studentRows(ctx.students, (s) => ({
          name: s.full_name || '—',
          email: s.email,
          roll: s.roll_number || '—',
          branch: s.branch || '—',
          year: s.academic_year || '—',
          attempts: s.attempts,
          avg: s.attempts > 0 ? formatScorePercentLabel(s.avgScore) : '—',
          latest: fmtDate(s.latestAttemptAt),
        })),
      };

    case 'students_with_attempts':
      return {
        title: 'Students with attempts',
        subtitle: 'Learners who have started at least one test',
        generatedAt: generated,
        summaryLines: [`Count: ${ctx.stats.totalStudentsAttended}`],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'roll', header: 'Roll no.' },
          { key: 'email', header: 'Email' },
          { key: 'branch', header: 'Branch' },
          { key: 'attempts', header: 'Attempts', align: 'right' },
          { key: 'avg', header: 'Avg score %', align: 'right' },
          { key: 'highest', header: 'Highest %', align: 'right' },
          { key: 'top_test', header: 'Top test' },
        ],
        rows: studentRows(
          ctx.students.filter((s) => s.attempts > 0),
          (s) => ({
            name: s.full_name || '—',
            roll: s.roll_number || '—',
            email: s.email,
            branch: s.branch || '—',
            attempts: s.attempts,
            avg: formatScorePercentLabel(s.avgScore),
            highest: formatScorePercentLabel(s.highestScore),
            top_test: s.highestTestName || '—',
          }),
        ),
      };

    case 'inactive_students': {
      return {
        title: 'Inactive students',
        subtitle: 'Registered but no test attempts yet',
        generatedAt: generated,
        summaryLines: [`Count: ${ctx.inactiveCount}`],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'roll', header: 'Roll no.' },
          { key: 'email', header: 'Email' },
          { key: 'branch', header: 'Branch' },
          { key: 'year', header: 'Year' },
        ],
        rows: studentRows(
          ctx.students.filter((s) => s.attempts === 0),
          (s) => ({
            name: s.full_name || '—',
            roll: s.roll_number || '—',
            email: s.email,
            branch: s.branch || '—',
            year: s.academic_year || '—',
          }),
        ),
      };
    }

    case 'low_performers':
      return {
        title: 'Students needing attention',
        subtitle: 'Average score below 40% (with attempts)',
        generatedAt: generated,
        summaryLines: [`Count: ${ctx.stats.lowPerformers}`],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'roll', header: 'Roll no.' },
          { key: 'email', header: 'Email' },
          { key: 'attempts', header: 'Attempts', align: 'right' },
          { key: 'avg', header: 'Avg score %', align: 'right' },
          { key: 'highest', header: 'Highest %', align: 'right' },
        ],
        rows: studentRows(
          ctx.students.filter((s) => s.attempts > 0 && s.avgScore < 40),
          (s) => ({
            name: s.full_name || '—',
            roll: s.roll_number || '—',
            email: s.email,
            attempts: s.attempts,
            avg: formatScorePercentLabel(s.avgScore),
            highest: formatScorePercentLabel(s.highestScore),
          }),
        ),
      };

    case 'tests_submitted':
      return basePayload(
        'All test submissions',
        'Every recorded attempt across categories',
        [`Total attempts: ${ctx.stats.totalTestsSubmitted}`],
        ATTEMPT_COLUMNS,
        attemptRows(ctx, () => true),
      );

    case 'tests_last_7_days': {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const rows = attemptRows(
        ctx,
        (a) => new Date(a.created_at ?? 0).getTime() >= cutoff,
      );
      return basePayload(
        'Tests submitted (last 7 days)',
        'Recent activity in the past week',
        [`Count: ${ctx.stats.testsLast7Days}`],
        ATTEMPT_COLUMNS,
        rows,
      );
    }

    case 'psychometric':
      return basePayload(
        'Psychometric tests',
        'Visual and pattern psychometric attempts by students',
        [`Submissions: ${ctx.stats.psychometricSubmitted}`],
        ATTEMPT_COLUMNS,
        attemptRows(ctx, (_, slug) => slug === 'psychometric'),
      );

    case 'attendance_rate':
      return {
        title: 'Attendance overview',
        subtitle: 'Students with at least one test attempt',
        generatedAt: generated,
        summaryLines: [
          `Attendance rate: ${formatScorePercentLabel(ctx.attendanceRate)}`,
          `${ctx.stats.totalStudentsAttended} of ${ctx.stats.totalRegisteredUsers} students`,
        ],
        columns: [
          { key: 'status', header: 'Status' },
          { key: 'name', header: 'Name' },
          { key: 'roll', header: 'Roll no.' },
          { key: 'email', header: 'Email' },
          { key: 'attempts', header: 'Attempts', align: 'right' },
        ],
        rows: studentRows(ctx.students, (s) => ({
          status: s.attempts > 0 ? 'Attended' : 'Not started',
          name: s.full_name || '—',
          roll: s.roll_number || '—',
          email: s.email,
          attempts: s.attempts,
        })),
      };

    case 'overall_average':
      return basePayload(
        'Score detail — overall average',
        `Mean score across ${ctx.attempts.length} attempts`,
        [`Overall average: ${formatScorePercentLabel(ctx.overallAverageScore)}`],
        ATTEMPT_COLUMNS,
        attemptRows(ctx, () => true),
      );

    case 'pass_rate':
      return basePayload(
        'Pass rate detail (≥ 40%)',
        'Attempts meeting the pass threshold',
        [
          `Pass rate: ${formatScorePercentLabel(ctx.passRate)}`,
          `${ctx.passedCount} passed of ${ctx.attempts.length} attempts`,
        ],
        ATTEMPT_COLUMNS,
        attemptRows(ctx, (a) => Number(a.score ?? 0) >= 40),
      );

    case 'avg_tests_per_student':
      return {
        title: 'Tests per student',
        subtitle: 'Distribution of attempt counts',
        generatedAt: generated,
        summaryLines: [`Average tests per active student: ${ctx.stats.avgTestsPerStudent}`],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'roll', header: 'Roll no.' },
          { key: 'email', header: 'Email' },
          { key: 'attempts', header: 'Attempts', align: 'right' },
          { key: 'avg', header: 'Avg score %', align: 'right' },
        ],
        rows: studentRows(
          ctx.students.filter((s) => s.attempts > 0),
          (s) => ({
            name: s.full_name || '—',
            roll: s.roll_number || '—',
            email: s.email,
            attempts: s.attempts,
            avg: formatScorePercentLabel(s.avgScore),
          }),
        ),
      };

    default:
      return null;
  }
}

export const ADMIN_CARD_LABELS: Record<AdminDashboardCardKey, string> = {
  registered_users: 'Registered users',
  students_with_attempts: 'Students with attempts',
  tests_submitted: 'Tests submitted',
  avg_tests_per_student: 'Avg tests / student',
  tests_last_7_days: 'Tests (7 days)',
  low_performers: 'Need attention',
  psychometric: 'Psychometric',
  attendance_rate: 'Attendance rate',
  overall_average: 'Overall average score',
  pass_rate: 'Pass rate',
  inactive_students: 'Inactive students',
};
