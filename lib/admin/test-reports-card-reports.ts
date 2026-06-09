import { formatAttemptStatus, isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import { formatScorePercentLabel } from '@/lib/format-score';
import type { TableReportPayload } from '@/lib/reports/table-report';
import type { TestReportRow, TestReportsPayload } from '@/lib/admin/test-reports-data';

export type TestReportsCardKey =
  | 'total_attempts'
  | 'in_progress'
  | 'completed'
  | 'unique_students'
  | 'avg_score'
  | 'highest_score';

const ATTEMPT_COLUMNS = [
  { key: 'student_name', header: 'Student' },
  { key: 'roll_number', header: 'Roll no.' },
  { key: 'email', header: 'Email' },
  { key: 'branch', header: 'Branch' },
  { key: 'year', header: 'Year' },
  { key: 'test_name', header: 'Test' },
  { key: 'score', header: 'Score %', align: 'right' as const },
  { key: 'status', header: 'Status' },
  { key: 'started_at', header: 'Started' },
  { key: 'completed_at', header: 'Completed' },
  { key: 'time_min', header: 'Time (min)', align: 'right' as const },
];

const STUDENT_COLUMNS = [
  { key: 'student_name', header: 'Student' },
  { key: 'roll_number', header: 'Roll no.' },
  { key: 'email', header: 'Email' },
  { key: 'branch', header: 'Branch' },
  { key: 'year', header: 'Year' },
  { key: 'attempts', header: 'Attempts', align: 'right' as const },
  { key: 'completed', header: 'Completed', align: 'right' as const },
  { key: 'avg_score', header: 'Avg score %', align: 'right' as const },
  { key: 'highest_score', header: 'Highest %', align: 'right' as const },
  { key: 'latest_activity', header: 'Latest activity' },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function attemptTableRow(r: TestReportRow): Record<string, string | number> {
  return {
    student_name: r.student_name,
    roll_number: r.roll_number || '—',
    email: r.email,
    branch: r.branch ?? '—',
    year: r.academic_year ?? '—',
    test_name: r.test_name,
    score: formatScorePercentLabel(r.score),
    status: formatAttemptStatus(r.status),
    started_at: fmtDate(r.created_at),
    completed_at: fmtDate(r.completed_at),
    time_min:
      r.time_taken_sec != null ? Math.max(1, Math.round(r.time_taken_sec / 60)) : '—',
  };
}

function completedRows(rows: TestReportRow[]): TestReportRow[] {
  return rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at));
}

function inProgressRows(rows: TestReportRow[]): TestReportRow[] {
  return rows.filter((r) => isInProgressStatus(r.status) && !r.completed_at);
}

function uniqueStudentRows(rows: TestReportRow[]): Array<Record<string, string | number>> {
  const byUser = new Map<
    string,
    {
      row: TestReportRow;
      attempts: number;
      completed: number;
      scores: number[];
      latest: string;
    }
  >();

  for (const r of rows) {
    const prev = byUser.get(r.user_id);
    const latest = [r.completed_at, r.created_at].filter(Boolean).sort().reverse()[0] ?? r.created_at;
    const done = isCompletedAttemptStatus(r.status, r.completed_at);

    if (!prev) {
      byUser.set(r.user_id, {
        row: r,
        attempts: 1,
        completed: done ? 1 : 0,
        scores: done ? [r.score] : [],
        latest,
      });
      continue;
    }

    prev.attempts += 1;
    if (done) {
      prev.completed += 1;
      prev.scores.push(r.score);
    }
    if (latest > prev.latest) prev.latest = latest;
    if (r.score > (prev.scores.length ? Math.max(...prev.scores) : -1)) prev.row = r;
  }

  return Array.from(byUser.values())
    .sort((a, b) => b.attempts - a.attempts)
    .map(({ row, attempts, completed, scores, latest }) => {
      const avg =
        scores.length > 0
          ? scores.reduce((s, n) => s + n, 0) / scores.length
          : null;
      const highest = scores.length > 0 ? Math.max(...scores) : null;
      return {
        student_name: row.student_name,
        roll_number: row.roll_number || '—',
        email: row.email,
        branch: row.branch ?? '—',
        year: row.academic_year ?? '—',
        attempts,
        completed,
        avg_score: avg != null ? formatScorePercentLabel(avg) : '—',
        highest_score: highest != null ? formatScorePercentLabel(highest) : '—',
        latest_activity: fmtDate(latest),
      };
    });
}

export type TestReportsReportContext = {
  payload: TestReportsPayload;
  examLabel: string;
  testFilterLabel?: string;
};

export function buildTestReportsCardReport(
  key: TestReportsCardKey,
  ctx: TestReportsReportContext,
): TableReportPayload {
  const { payload, examLabel, testFilterLabel } = ctx;
  const generated = new Date().toLocaleString();
  const scope = testFilterLabel
    ? `${examLabel} · ${testFilterLabel}`
    : examLabel;
  const { summary, rows } = payload;

  const base = (
    title: string,
    subtitle: string,
    summaryLines: string[],
    columns: TableReportPayload['columns'],
    tableRows: Array<Record<string, string | number>>,
  ): TableReportPayload => ({
    title,
    subtitle,
    generatedAt: generated,
    summaryLines,
    columns,
    rows: tableRows,
  });

  switch (key) {
    case 'total_attempts':
      return base(
        'All attempts',
        scope,
        [`Total attempts: ${summary.total_attempts}`, `Exam family: ${examLabel}`],
        ATTEMPT_COLUMNS,
        rows.map(attemptTableRow),
      );

    case 'in_progress':
      return base(
        'In progress',
        'Attempts started but not yet submitted',
        [
          `In progress: ${summary.in_progress_count}`,
          `Out of ${summary.total_attempts} total attempts`,
        ],
        ATTEMPT_COLUMNS,
        inProgressRows(rows).map(attemptTableRow),
      );

    case 'completed':
      return base(
        'Completed attempts',
        'Submitted attempts with final scores',
        [
          `Completed: ${summary.completed_count}`,
          `Pass rate (≥40%): ${formatScorePercentLabel(summary.pass_rate)}`,
        ],
        ATTEMPT_COLUMNS,
        completedRows(rows).map(attemptTableRow),
      );

    case 'unique_students':
      return base(
        'Students',
        'Unique learners with at least one attempt in this report',
        [
          `Unique students: ${summary.unique_students}`,
          `Total attempts: ${summary.total_attempts}`,
        ],
        STUDENT_COLUMNS,
        uniqueStudentRows(rows),
      );

    case 'avg_score': {
      const scored = rows.filter((r) => r.score > 0);
      const done = completedRows(rows);
      const avgFrom =
        done.length > 0
          ? done
          : scored.length > 0
            ? scored
            : rows;
      const avg =
        avgFrom.length > 0
          ? avgFrom.reduce((s, r) => s + r.score, 0) / avgFrom.length
          : summary.avg_score;
      return base(
        'Average score',
        done.length > 0
          ? 'Completed attempts only'
          : 'Includes live in-progress scores during the exam',
        [
          `Average: ${formatScorePercentLabel(avg)}`,
          `Based on ${avgFrom.length} attempt${avgFrom.length === 1 ? '' : 's'}`,
        ],
        ATTEMPT_COLUMNS,
        avgFrom.map(attemptTableRow),
      );
    }

    case 'highest_score': {
      const ranked = [...rows].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
      const done = completedRows(rows).sort((a, b) => b.score - a.score);
      const tableRows = (ranked.length > 0 ? ranked : done).map(attemptTableRow);
      const top = ranked[0]?.score ?? done[0]?.score ?? summary.highest_score;
      return base(
        'Highest scores',
        ranked.some((r) => isInProgressStatus(r.status) && !r.completed_at)
          ? 'Live and completed attempts ranked by score'
          : 'Attempts ranked by score',
        [
          `Highest: ${formatScorePercentLabel(top)}`,
          `Showing ${tableRows.length} attempt${tableRows.length === 1 ? '' : 's'}`,
        ],
        ATTEMPT_COLUMNS,
        tableRows,
      );
    }

    default:
      return base('Test report', scope, [], ATTEMPT_COLUMNS, []);
  }
}

export const TEST_REPORTS_CARD_LABELS: Record<TestReportsCardKey, string> = {
  total_attempts: 'Attempts',
  in_progress: 'In progress',
  completed: 'Completed',
  unique_students: 'Students',
  avg_score: 'Average score',
  highest_score: 'Highest score',
};
