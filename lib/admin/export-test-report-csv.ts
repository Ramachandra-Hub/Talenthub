import { ADMIN_EXAM_TYPE_META, type AdminExamType } from '@/lib/admin/exam-type';
import type { TestReportRow, TestReportsPayload } from '@/lib/admin/test-reports-data';
import { formatScorePercent, formatScorePercentLabel } from '@/lib/format-score';

function escapeCsv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function downloadTestReportCsv(
  payload: TestReportsPayload,
  options?: { testId?: string; testName?: string },
): void {
  const typeLabel = ADMIN_EXAM_TYPE_META[payload.exam_type].label;
  const lines: string[] = [];
  const generatedAt = new Date().toLocaleString();

  lines.push(`${typeLabel} — Test Report`);
  lines.push(`Generated At,${escapeCsv(generatedAt)}`);
  if (payload.report_date_label) {
    lines.push(`Report Date (IST),${escapeCsv(payload.report_date_label)}`);
  }
  if (options?.testName) {
    lines.push(`Filtered Test,${escapeCsv(options.testName)}`);
  }
  lines.push(`Total Attempts,${payload.summary.total_attempts}`);
  lines.push(`Unique Students,${payload.summary.unique_students}`);
  lines.push(`Average Score,${formatScorePercentLabel(payload.summary.avg_score)}`);
  lines.push(`Pass Rate (≥40%),${formatScorePercentLabel(payload.summary.pass_rate)}`);
  lines.push(`Highest Score,${formatScorePercentLabel(payload.summary.highest_score)}`);
  lines.push('');

  lines.push('Attempts');
  lines.push(
    'Attempt ID,Student Name,Email,Roll Number,Branch,Year,Test Name,Exam Type,Score %,Status,Completed At,Time Taken (min)',
  );

  for (const row of payload.rows) {
    lines.push(
      [
        escapeCsv(row.attempt_id),
        escapeCsv(row.student_name),
        escapeCsv(row.email),
        escapeCsv(row.roll_number),
        escapeCsv(row.branch ?? ''),
        escapeCsv(row.academic_year ?? ''),
        escapeCsv(row.test_name),
        escapeCsv(row.exam_type),
        formatScorePercent(row.score),
        escapeCsv(row.status),
        escapeCsv(row.completed_at ? new Date(row.completed_at).toLocaleString() : ''),
        row.time_taken_sec != null ? Math.round(row.time_taken_sec / 60) : '',
      ].join(','),
    );
  }

  const slug = payload.exam_type === 'all' ? 'all-tests' : payload.exam_type;
  const testPart = options?.testId && options.testId !== 'all' ? `-${options.testId.slice(0, 8)}` : '';
  const datePart = payload.report_date ? `-today-${payload.report_date}` : '';
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `test-report-${slug}${testPart}${datePart}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function filterReportRows(
  rows: TestReportRow[],
  search: string,
): TestReportRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.student_name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.roll_number.toLowerCase().includes(q) ||
      r.test_name.toLowerCase().includes(q),
  );
}
