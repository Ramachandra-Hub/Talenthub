import { attemptActivityDateKey, formatDateKeyLabel } from '@/lib/admin/report-date-filter';
import { isInProgressStatus } from '@/lib/attempt-status';
import { formatScorePercentLabel, roundRatePercent } from '@/lib/format-score';
import type { TableReportPayload } from '@/lib/reports/table-report';
import type {
  AdminDashboardAttempt,
  AdminDashboardStudent,
} from '@/lib/admin/dashboard-card-reports';

export type AttendanceDaySummary = {
  dateKey: string;
  dateLabel: string;
  totalStudents: number;
  attendedCount: number;
  absentCount: number;
  attendanceRate: number;
  attemptsOnDate: number;
};

export type AttendanceDayStudentRow = {
  studentId: string;
  status: 'Attended' | 'Absent';
  name: string;
  roll: string;
  email: string;
  branch: string;
  year: string;
  attemptsOnDate: number;
  testsOnDate: string;
  bestScoreOnDate: string;
  lastActivityOnDate: string;
};

function attemptsForStudentOnDate(
  studentId: string,
  dateKey: string,
  attempts: AdminDashboardAttempt[],
): AdminDashboardAttempt[] {
  return attempts.filter((a) => {
    if (String(a.user_id ?? '') !== studentId) return false;
    const key = attemptActivityDateKey({
      created_at: a.created_at ?? '',
      completed_at: a.completed_at ?? null,
    });
    if (key === dateKey) return true;
    if (isInProgressStatus(a.status) && !a.completed_at) {
      const startedKey = attemptActivityDateKey({
        created_at: a.created_at ?? '',
        completed_at: null,
      });
      return startedKey === dateKey;
    }
    return false;
  });
}

export function buildAttendanceDayRows(
  dateKey: string,
  students: AdminDashboardStudent[],
  attempts: AdminDashboardAttempt[],
): AttendanceDayStudentRow[] {
  return students.map((student) => {
    const dayAttempts = attemptsForStudentOnDate(student.id, dateKey, attempts);
    const attended = dayAttempts.length > 0;
    const testNames = [...new Set(dayAttempts.map((a) => a.test_name || 'Test').filter(Boolean))];
    const scores = dayAttempts.map((a) => Number(a.score ?? 0));
    const best = scores.length > 0 ? Math.max(...scores) : null;
    const lastIso = dayAttempts
      .map((a) => a.completed_at ?? a.created_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      studentId: student.id,
      status: attended ? 'Attended' : 'Absent',
      name: student.full_name || '—',
      roll: student.roll_number || '—',
      email: student.email,
      branch: student.branch || '—',
      year: student.academic_year || '—',
      attemptsOnDate: dayAttempts.length,
      testsOnDate: testNames.join('; ') || '—',
      bestScoreOnDate: best != null ? formatScorePercentLabel(best) : '—',
      lastActivityOnDate: lastIso ? new Date(lastIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—',
    };
  });
}

export function summarizeAttendanceDay(
  dateKey: string,
  students: AdminDashboardStudent[],
  attempts: AdminDashboardAttempt[],
): AttendanceDaySummary {
  const rows = buildAttendanceDayRows(dateKey, students, attempts);
  const attendedCount = rows.filter((r) => r.status === 'Attended').length;
  const totalStudents = students.length;
  const attemptsOnDate = attempts.filter((a) => {
    const key = attemptActivityDateKey({
      created_at: a.created_at ?? '',
      completed_at: a.completed_at ?? null,
    });
    return key === dateKey;
  }).length;

  return {
    dateKey,
    dateLabel: formatDateKeyLabel(dateKey),
    totalStudents,
    attendedCount,
    absentCount: totalStudents - attendedCount,
    attendanceRate:
      totalStudents > 0 ? roundRatePercent((attendedCount / totalStudents) * 100) : 0,
    attemptsOnDate,
  };
}

export function attendanceBranchYearSummaryLines(
  dateKey: string,
  students: AdminDashboardStudent[],
  attempts: AdminDashboardAttempt[],
): string[] {
  const rows = buildAttendanceDayRows(dateKey, students, attempts);
  const groups = new Map<string, { total: number; attended: number }>();
  for (const row of rows) {
    const student = students.find((s) => s.id === row.studentId);
    const branch = student?.branch?.trim() || row.branch || 'Unassigned';
    const year = student?.academic_year?.trim() || row.year || '—';
    const key = `${branch} · Year ${year}`;
    const g = groups.get(key) ?? { total: 0, attended: 0 };
    g.total += 1;
    if (row.status === 'Attended') g.attended += 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, g]) => {
      const rate =
        g.total > 0 ? roundRatePercent((g.attended / g.total) * 100) : 0;
      return `${label}: ${g.attended}/${g.total} present (${formatScorePercentLabel(rate)})`;
    });
}

export function buildAttendanceReportPayload(
  dateKey: string,
  students: AdminDashboardStudent[],
  attempts: AdminDashboardAttempt[],
  options?: { branch?: string; year?: string },
): TableReportPayload {
  const branchFilter = options?.branch?.trim();
  const yearFilter = options?.year?.trim();
  const scopedStudents = students.filter((s) => {
    if (branchFilter && branchFilter !== 'all' && (s.branch || '—') !== branchFilter) return false;
    if (yearFilter && yearFilter !== 'all' && (s.academic_year || '—') !== yearFilter) return false;
    return true;
  });
  const scopedIds = new Set(scopedStudents.map((s) => s.id));
  const scopedAttempts = attempts.filter((a) => scopedIds.has(String(a.user_id ?? '')));

  const summary = summarizeAttendanceDay(dateKey, scopedStudents, scopedAttempts);
  const rows = buildAttendanceDayRows(dateKey, scopedStudents, scopedAttempts).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Attended' ? -1 : 1;
    if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
    if (a.year !== b.year) return a.year.localeCompare(b.year);
    return a.name.localeCompare(b.name);
  });

  const branchSummary = attendanceBranchYearSummaryLines(dateKey, scopedStudents, scopedAttempts);

  return {
    title: 'Student attendance report',
    subtitle: `${summary.dateLabel} (IST)${branchFilter && branchFilter !== 'all' ? ` · ${branchFilter}` : ''}${yearFilter && yearFilter !== 'all' ? ` · Year ${yearFilter}` : ''}`,
    generatedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    summaryLines: [
      `Attendance rate: ${formatScorePercentLabel(summary.attendanceRate)}`,
      `Present: ${summary.attendedCount} of ${summary.totalStudents} students`,
      `Absent: ${summary.absentCount}`,
      `Test attempts on this date: ${summary.attemptsOnDate}`,
      ...branchSummary,
    ],
    columns: [
      { key: 'status', header: 'Status' },
      { key: 'name', header: 'Name' },
      { key: 'roll', header: 'Roll no.' },
      { key: 'email', header: 'Email' },
      { key: 'branch', header: 'Branch' },
      { key: 'year', header: 'Year' },
      { key: 'attemptsOnDate', header: 'Attempts', align: 'right' },
      { key: 'testsOnDate', header: 'Tests written' },
      { key: 'bestScoreOnDate', header: 'Best score %', align: 'right' },
      { key: 'lastActivityOnDate', header: 'Last activity (IST)' },
    ],
    rows: rows.map((r) => ({
      status: r.status,
      name: r.name,
      roll: r.roll,
      email: r.email,
      branch: r.branch,
      year: r.year,
      attemptsOnDate: r.attemptsOnDate,
      testsOnDate: r.testsOnDate,
      bestScoreOnDate: r.bestScoreOnDate,
      lastActivityOnDate: r.lastActivityOnDate,
    })),
  };
}
