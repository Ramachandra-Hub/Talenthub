import type { DbServiceClient } from '@/lib/db/get-db-service';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import type { RollupAttempt, RollupStudent } from '@/lib/admin/attempts-rollup';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import { averageScorePercent, roundRatePercent, roundScorePercent } from '@/lib/format-score';
import { ELEVATEX_EXAM_NAME, ELEVATEX_TEST_ID } from '@/lib/elevatex';
import { isElevateXAttemptMeta } from '@/lib/placement/scorecard-payload';
import { latestAttemptPerUser, sortTestReportRows } from '@/lib/admin/schedule-report-filter';
import { getIstDayBoundsIso, isInstantOnDateKey } from '@/lib/admin/report-date-filter';
import type { TestReportsPayload, TestReportRow } from '@/lib/admin/test-reports-data';
import type { DashboardStatEntry } from '@/lib/student-dashboard-stats';
import type { AttemptRow } from '@/lib/test-attempts';
import { resolveStoredPercent } from '@/lib/test-attempts';

function parseStatAttempts(raw: unknown): DashboardStatEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is DashboardStatEntry => {
    if (!row || typeof row !== 'object') return false;
    const o = row as DashboardStatEntry;
    return Boolean(o.id && o.user_id);
  });
}

function attemptFromTestRow(row: AttemptRow): RollupAttempt {
  const created = String(row.created_at ?? row.started_at ?? new Date().toISOString());
  const status = String(row.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    test_id: row.test_id != null ? String(row.test_id) : null,
    test_name: String(row.test_title ?? ELEVATEX_EXAM_NAME),
    score: resolveStoredPercent(
      row.percentage_score != null ? Number(row.percentage_score) : null,
      row.score != null ? Number(row.score) : null,
      row.total_score != null ? Number(row.total_score) : null,
    ),
    status: status || (row.completed_at ? 'completed' : 'in_progress'),
    created_at: created,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    time_taken: row.time_taken != null ? Number(row.time_taken) : null,
    source: 'test_attempts',
  };
}

function attemptFromStatEntry(entry: DashboardStatEntry): RollupAttempt {
  return {
    id: String(entry.id),
    user_id: String(entry.user_id),
    test_id: entry.test_id ? String(entry.test_id) : null,
    test_name: entry.test_name || ELEVATEX_EXAM_NAME,
    score: Number(entry.score ?? 0),
    status: String(entry.status ?? 'completed'),
    created_at: entry.created_at,
    completed_at: entry.completed_at,
    time_taken: entry.time_taken,
    source: 'dashboard_stats',
  };
}

function matchesTodayElevateX(
  attempt: { test_id: string | null; test_name: string; created_at: string; completed_at: string | null },
  dateKey: string,
): boolean {
  if (!isElevateXAttemptMeta(attempt.test_id, attempt.test_name)) return false;
  return (
    isInstantOnDateKey(attempt.completed_at, dateKey) ||
    isInstantOnDateKey(attempt.created_at, dateKey)
  );
}

async function loadTodayElevateXAttemptsFromTable(
  admin: DbServiceClient,
  bounds: { start: string; end: string },
  dateKey: string,
): Promise<RollupAttempt[]> {
  const out: RollupAttempt[] = [];
  const seen = new Set<string>();

  const queries = [
    admin
      .from('test_attempts')
      .select('*')
      .gte('created_at', bounds.start)
      .lte('created_at', bounds.end)
      .order('created_at', { ascending: false })
      .limit(800),
    admin
      .from('test_attempts')
      .select('*')
      .gte('completed_at', bounds.start)
      .lte('completed_at', bounds.end)
      .order('completed_at', { ascending: false })
      .limit(800),
  ];

  const results = await Promise.all(queries);
  for (const { data, error } of results) {
    if (error) continue;
    for (const row of data ?? []) {
      const attempt = attemptFromTestRow(row as AttemptRow);
      if (!matchesTodayElevateX(attempt, dateKey)) continue;
      if (seen.has(attempt.id)) continue;
      seen.add(attempt.id);
      out.push(attempt);
    }
  }

  return out;
}

async function loadTodayElevateXFromDashboardStats(
  _admin: DbServiceClient,
  dateKey: string,
  seenIds: Set<string>,
): Promise<RollupAttempt[]> {
  const out: RollupAttempt[] = [];
  const { prisma } = await import('@/lib/prisma');

  const rows = await prisma.studentDashboardStat.findMany({
    where: { statKey: 'attempts_feed' },
    select: { userId: true, payload: true },
    take: 5000,
  });

  for (const row of rows) {
    for (const entry of parseStatAttempts(row.payload)) {
      const attempt = attemptFromStatEntry(entry);
      if (seenIds.has(attempt.id)) continue;
      if (!matchesTodayElevateX(attempt, dateKey)) continue;
      seenIds.add(attempt.id);
      out.push(attempt);
    }
  }

  return out;
}

async function loadStudentsForIds(
  admin: DbServiceClient,
  userIds: string[],
): Promise<Map<string, RollupStudent>> {
  const map = new Map<string, RollupStudent>();
  if (userIds.length === 0) return map;

  const chunkSize = 80;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data } = await admin
      .from('users')
      .select('id, email, full_name, branch, academic_year, created_at')
      .in('id', chunk);
    for (const row of data ?? []) {
      const id = String(row.id);
      map.set(id, {
        id,
        email: String(row.email ?? ''),
        full_name: (row.full_name as string | null) ?? null,
        roll_number: rollNumberFromUser(String(row.email ?? '')),
        branch: (row.branch as string | null) ?? null,
        academic_year: (row.academic_year as string | null) ?? null,
        created_at: (row.created_at as string | null) ?? null,
      });
    }
  }

  return map;
}

/** Fast ElevateX report for a single IST day — avoids full attempt rollup (504-safe). */
export async function loadElevateXTodayReportFast(
  admin: DbServiceClient,
  dateKey: string,
  reportDateLabel: string,
): Promise<TestReportsPayload> {
  const bounds = getIstDayBoundsIso(dateKey);
  const seenIds = new Set<string>();

  const fromTable = await loadTodayElevateXAttemptsFromTable(admin, bounds, dateKey);
  for (const a of fromTable) seenIds.add(a.id);

  const fromStats = await loadTodayElevateXFromDashboardStats(admin, dateKey, seenIds);
  const merged = latestAttemptPerUser([...fromTable, ...fromStats]);

  const userIds = [...new Set(merged.map((a) => a.user_id).filter(Boolean))];
  const studentById = await loadStudentsForIds(admin, userIds);

  const rows: TestReportRow[] = sortTestReportRows(
    merged.map((a) => {
      const student = studentById.get(a.user_id);
      return {
        attempt_id: a.id,
        user_id: a.user_id,
        student_name: student?.full_name?.trim() || student?.email || 'Student',
        email: student?.email ?? '',
        roll_number: student?.roll_number ?? rollNumberFromUser(student?.email ?? ''),
        branch: student?.branch ?? null,
        academic_year: student?.academic_year ?? null,
        test_id: a.test_id ?? ELEVATEX_TEST_ID,
        test_name: a.test_name || ELEVATEX_EXAM_NAME,
        exam_type: 'elevatex' as const,
        score: roundScorePercent(a.score),
        status: a.status,
        completed_at: a.completed_at,
        created_at: a.created_at,
        time_taken_sec: a.time_taken,
      };
    }),
  );

  const completedRows = rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at));
  const scores = completedRows.map((r) => r.score);
  const passed = scores.filter((s) => s >= 40).length;

  return {
    exam_type: 'elevatex',
    report_date: dateKey,
    report_date_label: reportDateLabel,
    summary: {
      total_attempts: rows.length,
      in_progress_count: rows.length - completedRows.length,
      completed_count: completedRows.length,
      unique_students: userIds.length,
      avg_score: scores.length > 0 ? averageScorePercent(scores) : 0,
      pass_rate: scores.length > 0 ? roundRatePercent((passed / scores.length) * 100) : 0,
      highest_score: scores.length > 0 ? roundScorePercent(Math.max(...scores)) : 0,
    },
    tests: [
      {
        id: ELEVATEX_TEST_ID,
        name: ELEVATEX_EXAM_NAME,
        attempt_count: rows.length,
      },
    ],
    rows,
  };
}
