import { prisma } from '@/lib/prisma';
import type { RollupAttempt } from '@/lib/admin/attempts-rollup';
import { DSA_HARD_OPEN_PREFIX } from '@/lib/exams/dsa-hard-open-constants';
import { ensureDsaHardOpenTables } from '@/lib/exams/dsa-hard-open';

/** Include hard-open coding attempts in Admin → Test reports. */
export async function loadHardOpenAttemptsForTestReports(options?: {
  fromIso?: string;
  toIso?: string;
}): Promise<{ attempts: RollupAttempt[]; testsById: Map<string, string> }> {
  await ensureDsaHardOpenTables();
  type Row = {
    id: string;
    exam_id: string;
    user_id: string;
    status: string;
    total_score: number;
    max_score: number;
    started_at: Date;
    submitted_at: Date | null;
    exam_title: string | null;
  };

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options?.fromIso) {
    params.push(new Date(options.fromIso));
    clauses.push(`a."started_at" >= $${params.length}::timestamptz`);
  }
  if (options?.toIso) {
    params.push(new Date(options.toIso));
    clauses.push(`a."started_at" <= $${params.length}::timestamptz`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT a."id", a."exam_id", a."user_id", a."status", a."total_score", a."max_score",
            a."started_at", a."submitted_at", e."title" AS exam_title
     FROM "dsa_hard_open_attempts" a
     LEFT JOIN "exams" e ON e."id" = a."exam_id"
     ${where}
     ORDER BY a."started_at" DESC
     LIMIT 5000`,
    ...params,
  );

  const testsById = new Map<string, string>();
  const attempts: RollupAttempt[] = rows.map((row) => {
    const testId = `${DSA_HARD_OPEN_PREFIX}${row.exam_id}`;
    const title = row.exam_title?.trim() || 'Hard Coding Open Link';
    testsById.set(testId, title);
    const max = Number(row.max_score) || 100;
    const score =
      max > 0 ? Math.round((Number(row.total_score) / max) * 10000) / 100 : 0;
    const submitted = row.status === 'submitted' || Boolean(row.submitted_at);
    return {
      id: row.id,
      user_id: row.user_id,
      test_id: testId,
      test_name: title,
      score,
      status: submitted ? 'completed' : 'in_progress',
      created_at: new Date(row.started_at).toISOString(),
      completed_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      time_taken: null,
      source: 'test_attempts',
    };
  });

  return { attempts, testsById };
}
