import type { DbServiceClient } from '@/lib/db/get-db-service';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { resolveStoredPercent, testIdsMatch, type AttemptRow } from '@/lib/test-attempts';
import type { DashboardStatEntry } from '@/lib/student-dashboard-stats';

export type RollupAttempt = {
  id: string;
  user_id: string;
  test_id: string | null;
  test_name: string;
  score: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  time_taken: number | null;
  source: 'test_attempts' | 'dashboard_stats';
};

export type RollupStudent = {
  id: string;
  email: string;
  full_name: string | null;
  roll_number: string;
  branch: string | null;
  academic_year: string | null;
  created_at: string | null;
};

function parseStatAttempts(raw: unknown): DashboardStatEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is DashboardStatEntry => {
    if (!row || typeof row !== 'object') return false;
    const o = row as DashboardStatEntry;
    return Boolean(o.id && o.user_id);
  });
}

function rowScore(row: AttemptRow): number {
  return resolveStoredPercent(
    row.percentage_score != null ? Number(row.percentage_score) : null,
    row.score != null ? Number(row.score) : null,
    row.total_score != null ? Number(row.total_score) : null,
  );
}

function inferAttemptStatus(row: AttemptRow): string {
  const raw = String(row.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (raw) return raw;
  if (row.completed_at) return 'completed';
  return 'in_progress';
}

function attemptFromRow(row: AttemptRow, testName: string): RollupAttempt {
  const created = String(row.created_at ?? row.started_at ?? new Date().toISOString());
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    test_id: row.test_id != null ? String(row.test_id) : null,
    test_name: testName,
    score: rowScore(row),
    status: inferAttemptStatus(row),
    created_at: created,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    time_taken: row.time_taken != null ? Number(row.time_taken) : null,
    source: 'test_attempts',
  };
}

function attemptFromStat(entry: DashboardStatEntry): RollupAttempt {
  return {
    id: String(entry.id),
    user_id: String(entry.user_id),
    test_id: entry.test_id ? String(entry.test_id) : null,
    test_name: entry.test_name || 'Practice test',
    score: Number(entry.score ?? 0),
    status: String(entry.status ?? 'completed'),
    created_at: entry.created_at,
    completed_at: entry.completed_at,
    time_taken: entry.time_taken,
    source: 'dashboard_stats',
  };
}

function resolveTestName(
  row: AttemptRow,
  testsById: Map<string, string>,
  facultyByTestId: Map<string, string>,
): string {
  const saved = row.test_title;
  if (saved && String(saved).trim()) return String(saved).trim();
  const testId = row.test_id != null ? String(row.test_id) : '';
  if (testId) {
    return testsById.get(testId) ?? facultyByTestId.get(testId) ?? `Test ${testId.slice(0, 8)}`;
  }
  return 'Practice test';
}

function dedupeAttempts(rows: RollupAttempt[]): RollupAttempt[] {
  const byKey = new Map<string, RollupAttempt>();
  for (const row of rows) {
    const key = `${row.user_id}::${row.test_id ?? ''}::${row.test_name.toLowerCase()}::${row.completed_at ?? row.created_at}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    if (existing.source === 'dashboard_stats' && row.source === 'test_attempts') {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function loadAdminStudents(admin: DbServiceClient): Promise<RollupStudent[]> {
  const byId = new Map<string, RollupStudent & { metadata?: Record<string, unknown> }>();

  const { data: dbUsers } = await admin
    .from('users')
    .select('id, email, full_name, branch, academic_year, created_at')
    .order('created_at', { ascending: false });

  for (const row of dbUsers ?? []) {
    byId.set(row.id as string, {
      id: row.id as string,
      email: String(row.email ?? ''),
      full_name: (row.full_name as string | null) ?? null,
      roll_number: rollNumberFromUser(String(row.email ?? '')),
      branch: (row.branch as string | null) ?? null,
      academic_year: (row.academic_year as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
    });
  }

  let page = 1;
  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (byId.has(user.id)) {
        const existing = byId.get(user.id)!;
        existing.roll_number = rollNumberFromUser(
          existing.email || user.email || '',
          user.user_metadata as Record<string, unknown>,
        );
        continue;
      }
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const role = String(meta.role ?? 'student');
      if (role === 'admin') continue;
      byId.set(user.id, {
        id: user.id,
        email: user.email ?? '',
        full_name:
          (meta.full_name as string | undefined) ??
          (meta.name as string | undefined) ??
          null,
        roll_number: rollNumberFromUser(user.email ?? '', meta),
        branch:
          (meta.branch as string | undefined) ??
          (meta.department as string | undefined) ??
          null,
        academic_year:
          (meta.academic_year as string | undefined) ??
          (meta.year as string | undefined) ??
          null,
        created_at: user.created_at ?? null,
      });
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  return Array.from(byId.values())
    .filter(
      (u) =>
        u.email &&
        !u.email.includes('@admin.') &&
        !u.email.includes('@faculty.'),
    )
    .map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      roll_number: u.roll_number,
      branch: u.branch,
      academic_year: u.academic_year,
      created_at: u.created_at,
    }));
}

export async function loadAllAttemptsRollup(admin: DbServiceClient): Promise<{
  attempts: RollupAttempt[];
  testsById: Map<string, string>;
}> {
  const testsById = new Map<string, string>();
  const facultyByTestId = new Map<string, string>();

  const { data: testsData } = await admin.from('tests').select('id, name, title');
  for (const row of testsData ?? []) {
    const id = String(row.id);
    testsById.set(id, String(row.title ?? row.name ?? `Test ${id}`));
  }

  const { data: facultyRows } = await admin
    .from('faculty_exam_requests')
    .select('published_test_id, title')
    .eq('status', 'approved')
    .not('published_test_id', 'is', null);

  for (const row of facultyRows ?? []) {
    if (row.published_test_id) {
      facultyByTestId.set(String(row.published_test_id), String(row.title ?? 'Department exam'));
    }
  }

  const merged: RollupAttempt[] = [];
  const seenIds = new Set<string>();

  const attemptRows: AttemptRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await admin
      .from('test_attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    const page = (data ?? []) as AttemptRow[];
    if (!page.length) break;
    attemptRows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  for (const row of attemptRows ?? []) {
    const attempt = attemptFromRow(row as AttemptRow, resolveTestName(row as AttemptRow, testsById, facultyByTestId));
    merged.push(attempt);
    seenIds.add(attempt.id);
    if (attempt.test_id && !testsById.has(attempt.test_id)) {
      testsById.set(attempt.test_id, attempt.test_name);
    }
  }

  const { data: statsRows, error: statsError } = await admin
    .from('student_dashboard_stats')
    .select('id, user_id, attempts')
    .order('id', { ascending: true });

  if (statsError) {
    const msg = String(statsError.message ?? '').toLowerCase();
    if (msg.includes('column "attempts"') || msg.includes('attempts does not exist')) {
      const { loadAllAttemptsRollupPrisma } = await import('@/lib/admin/attempts-rollup-prisma');
      return loadAllAttemptsRollupPrisma();
    }
  }

  for (const row of statsRows ?? []) {
    for (const entry of parseStatAttempts(row.attempts)) {
      if (seenIds.has(String(entry.id))) continue;
      const attempt = attemptFromStat(entry);
      merged.push(attempt);
      if (attempt.test_id && !testsById.has(attempt.test_id)) {
        testsById.set(attempt.test_id, attempt.test_name);
      }
    }
  }

  return { attempts: dedupeAttempts(merged), testsById };
}

export function filterAttemptsForTest(
  attempts: RollupAttempt[],
  testId: string,
): RollupAttempt[] {
  return attempts.filter((a) => a.test_id && testIdsMatch(a.test_id, testId));
}
