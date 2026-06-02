import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Test, TestAttempt } from '@/lib/types';
import {
  buildStatEntry,
  statEntryToAttempt,
  type DashboardStatEntry,
} from '@/lib/student-dashboard-stats';

const ATTEMPTS_STAT_KEY = 'attempts_feed';

function parseAttemptsPayload(raw: Prisma.JsonValue | null | undefined): DashboardStatEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is DashboardStatEntry => {
    if (!row || typeof row !== 'object') return false;
    const o = row as DashboardStatEntry;
    return Boolean(o.id && o.user_id && o.test_name != null);
  });
}

export async function appendStudentDashboardStatPrisma(
  userId: string,
  entry: DashboardStatEntry,
): Promise<void> {
  const existing = await prisma.studentDashboardStat.findUnique({
    where: { userId_statKey: { userId, statKey: ATTEMPTS_STAT_KEY } },
    select: { payload: true },
  });

  const list = parseAttemptsPayload(existing?.payload ?? null);
  const next = [entry, ...list.filter((row) => String(row.id) !== String(entry.id))].slice(0, 50);

  await prisma.studentDashboardStat.upsert({
    where: { userId_statKey: { userId, statKey: ATTEMPTS_STAT_KEY } },
    create: {
      userId,
      statKey: ATTEMPTS_STAT_KEY,
      payload: next as Prisma.InputJsonValue,
    },
    update: {
      payload: next as Prisma.InputJsonValue,
    },
  });
}

export async function fetchDashboardStatEntriesPrisma(
  userId: string,
): Promise<DashboardStatEntry[]> {
  const row = await prisma.studentDashboardStat.findUnique({
    where: { userId_statKey: { userId, statKey: ATTEMPTS_STAT_KEY } },
    select: { payload: true },
  });
  return parseAttemptsPayload(row?.payload ?? null);
}

export async function fetchStudentDashboardStatsPrisma(
  userId: string,
): Promise<Array<TestAttempt & { test: Test }>> {
  const entries = await fetchDashboardStatEntriesPrisma(userId);
  return entries.map(statEntryToAttempt);
}

export async function findDashboardStatEntryByAttemptIdPrisma(
  attemptId: string,
): Promise<{ entry: DashboardStatEntry; userId: string } | null> {
  const rows = await prisma.studentDashboardStat.findMany({
    where: { statKey: ATTEMPTS_STAT_KEY },
    select: { userId: true, payload: true },
    take: 5000,
  });

  for (const row of rows) {
    const list = parseAttemptsPayload(row.payload);
    const hit = list.find((entry) => String(entry.id) === attemptId);
    if (hit) return { entry: hit, userId: row.userId };
  }

  return null;
}

export { buildStatEntry };
