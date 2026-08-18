import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { livePartialScoreFromAttemptRow } from '@/lib/admin/elevatex-partial-score';
import { isElevateXAttemptMeta } from '@/lib/placement/scorecard-payload';
import {
  resolveStoredPercent,
  testIdsMatch,
  type AttemptRow,
} from '@/lib/test-attempts';
import type { DashboardStatEntry } from '@/lib/student-dashboard-stats';
import type { RollupAttempt, RollupStudent } from '@/lib/admin/attempts-rollup';

function parseStatAttempts(raw: unknown): DashboardStatEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is DashboardStatEntry => {
    if (!row || typeof row !== 'object') return false;
    const o = row as DashboardStatEntry;
    return Boolean(o.id && o.user_id);
  });
}

function resolveAttemptTitle(row: AttemptRow, testName: string): string {
  const title = row.test_title;
  return typeof title === 'string' && title.trim() ? title : testName;
}

function rowScore(row: AttemptRow, testName: string): number {
  return livePartialScoreFromAttemptRow({
    answers: row.answers,
    percentageScore: row.percentage_score != null ? Number(row.percentage_score) : null,
    score: row.score != null ? Number(row.score) : null,
    totalScore: row.total_score != null ? Number(row.total_score) : null,
  });
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
  const rawTestId = row.test_id != null ? String(row.test_id).trim() : '';
  const testId =
    rawTestId ||
    (isElevateXAttemptMeta(rawTestId, resolveAttemptTitle(row, testName)) ? 'placement_full' : null);
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    test_id: testId,
    test_name: testName,
    score: rowScore(row, testName),
    status: inferAttemptStatus(row),
    created_at: created,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    time_taken: row.time_taken != null ? Number(row.time_taken) : null,
    source: 'test_attempts',
    schedule_id: row.schedule_id != null ? String(row.schedule_id) : null,
    slot_number: row.slot_number != null ? Number(row.slot_number) : null,
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

function toAttemptRow(row: {
  id: string;
  userId: string;
  testId: string | null;
  testTitle: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  score: { toNumber?: () => number } | number | null;
  percentageScore: { toNumber?: () => number } | number | null;
  totalScore: { toNumber?: () => number } | number | null;
  answers?: unknown;
  timeTaken: number | null;
  status: string;
  createdAt: Date;
  scheduleId?: string | null;
  slotNumber?: number | null;
}): AttemptRow {
  const num = (v: { toNumber?: () => number } | number | null) =>
    v == null ? null : typeof v === 'number' ? v : Number(v);

  return {
    id: row.id,
    user_id: row.userId,
    test_id: row.testId ?? '',
    test_title: row.testTitle,
    started_at: row.startedAt?.toISOString(),
    completed_at: row.completedAt?.toISOString() ?? null,
    score: num(row.score),
    percentage_score: num(row.percentageScore),
    total_score: num(row.totalScore),
    answers: row.answers ?? null,
    time_taken: row.timeTaken,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    schedule_id: row.scheduleId ?? null,
    slot_number: row.slotNumber ?? null,
  };
}

export async function loadAdminStudentsPrisma(): Promise<RollupStudent[]> {
  const adminIds = new Set(
    (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
  );

  const users: Array<{
    id: string;
    email: string;
    fullName: string | null;
    rollNumber: string | null;
    branch: string | null;
    academicYear: string | null;
    createdAt: Date;
  }> = [];
  let cursorId: string | undefined;
  while (true) {
    const page = await prisma.user.findMany({
      where: { adminUser: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        rollNumber: true,
        branch: true,
        academicYear: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
      take: 1000,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (!page.length) break;
    users.push(...page);
    cursorId = page[page.length - 1].id;
    if (page.length < 1000) break;
  }

  return users
    .filter((u) => !adminIds.has(u.id) && u.email && !u.email.includes('@admin.'))
    .map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.fullName,
      roll_number: u.rollNumber ?? rollNumberFromUser(u.email),
      branch: u.branch,
      academic_year: u.academicYear,
      created_at: u.createdAt.toISOString(),
    }));
}

export type AttemptsRollupPrismaOptions = {
  fromIso?: string;
  toIso?: string;
  /** Include answers JSON (needed for live ElevateX partials). Default false for reports. */
  includeAnswers?: boolean;
  includeDashboardStats?: boolean;
};

export async function loadAllAttemptsRollupPrisma(
  options?: AttemptsRollupPrismaOptions,
): Promise<{
  attempts: RollupAttempt[];
  testsById: Map<string, string>;
}> {
  const testsById = new Map<string, string>();
  const facultyByTestId = new Map<string, string>();
  const includeAnswers = options?.includeAnswers !== false;
  const includeDashboardStats = options?.includeDashboardStats !== false;

  const tests = await prisma.test.findMany({
    select: { id: true, title: true, name: true },
  });
  for (const row of tests) {
    testsById.set(row.id, String(row.title ?? row.name ?? `Test ${row.id}`));
  }

  const facultyRows = await prisma.facultyExamRequest.findMany({
    where: { status: 'approved', publishedTestId: { not: null } },
    select: { publishedTestId: true, title: true },
  });
  for (const row of facultyRows) {
    if (row.publishedTestId) {
      facultyByTestId.set(row.publishedTestId, String(row.title ?? 'Department exam'));
    }
  }

  const merged: RollupAttempt[] = [];
  const seenIds = new Set<string>();

  const dateWhere: Prisma.TestAttemptWhereInput | undefined =
    options?.fromIso && options?.toIso
      ? {
          OR: [
            { completedAt: { gte: new Date(options.fromIso), lte: new Date(options.toIso) } },
            { createdAt: { gte: new Date(options.fromIso), lte: new Date(options.toIso) } },
          ],
        }
      : undefined;

  let attemptCursor: string | undefined;
  while (true) {
    const page = await prisma.testAttempt.findMany({
      where: dateWhere,
      select: {
        id: true,
        userId: true,
        testId: true,
        testTitle: true,
        startedAt: true,
        completedAt: true,
        score: true,
        percentageScore: true,
        totalScore: true,
        timeTaken: true,
        status: true,
        createdAt: true,
        scheduleId: true,
        slotNumber: true,
        ...(includeAnswers ? { answers: true } : {}),
      },
      orderBy: { id: 'asc' },
      take: 2000,
      ...(attemptCursor ? { cursor: { id: attemptCursor }, skip: 1 } : {}),
    });
    if (!page.length) break;
    for (const row of page) {
      const ar = toAttemptRow(row);
      const attempt = attemptFromRow(ar, resolveTestName(ar, testsById, facultyByTestId));
      merged.push(attempt);
      seenIds.add(attempt.id);
      if (attempt.test_id && !testsById.has(attempt.test_id)) {
        testsById.set(attempt.test_id, attempt.test_name);
      }
    }
    attemptCursor = page[page.length - 1].id;
    if (page.length < 2000) break;
  }

  if (includeDashboardStats) {
    let statsCursor: string | undefined;
    while (true) {
      const page = await prisma.studentDashboardStat.findMany({
        where: { statKey: 'attempts_feed' },
        select: { id: true, userId: true, payload: true },
        orderBy: { id: 'asc' },
        take: 2000,
        ...(statsCursor ? { cursor: { id: statsCursor }, skip: 1 } : {}),
      });
      if (!page.length) break;
      for (const row of page) {
        const attempts = parseStatAttempts(row.payload);
        for (const entry of attempts) {
          if (seenIds.has(String(entry.id))) continue;
          if (options?.fromIso && options?.toIso) {
            const created = entry.created_at ?? entry.completed_at;
            if (!created) continue;
            const t = new Date(created).getTime();
            if (t < new Date(options.fromIso).getTime() || t > new Date(options.toIso).getTime()) {
              continue;
            }
          }
          const attempt = attemptFromStat(entry);
          merged.push(attempt);
          if (attempt.test_id && !testsById.has(attempt.test_id)) {
            testsById.set(attempt.test_id, attempt.test_name);
          }
        }
      }
      statsCursor = page[page.length - 1].id;
      if (page.length < 2000) break;
    }
  }

  return { attempts: dedupeAttempts(merged), testsById };
}

export function filterAttemptsForTestPrisma(
  attempts: RollupAttempt[],
  testId: string,
): RollupAttempt[] {
  return attempts.filter((a) => a.test_id && testIdsMatch(a.test_id, testId));
}
