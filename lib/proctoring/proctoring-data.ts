import type { DbServiceClient, PostgrestError } from '@/lib/db/get-db-service';
import { isoFallsInIstDateRange, resolveIstDateRange } from '@/lib/college-timezone';
import { isExamViolationsSchemaError } from '@/lib/ensure-exam-violations';

export type ProctorViolationRow = {
  id: string;
  user_id: string;
  test_id: string | null;
  attempt_id: string | null;
  violation_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  source: 'exam_violations' | 'test_attempt';
};

export type ProctoringSummary = {
  total: number;
  byType: Record<string, number>;
  studentsFlagged: number;
  autoSubmits: number;
};

function isMissingTable(error: unknown): boolean {
  const err: PostgrestError | null =
    error && typeof error === 'object'
      ? {
          message:
            typeof (error as { message?: string }).message === 'string'
              ? (error as { message: string }).message
              : 'Unknown error',
          code: (error as { code?: string }).code,
        }
      : null;
  return isExamViolationsSchemaError(err);
}

function parseProctorFromAnswers(
  answers: unknown,
): { violations: Array<{ type: string; at: string }>; sessionId?: string; violationCount?: number } | null {
  if (!answers || typeof answers !== 'object') return null;
  const raw = (answers as Record<string, unknown>).__proctor;
  if (!raw || typeof raw !== 'object') return null;
  const block = raw as Record<string, unknown>;
  const list = Array.isArray(block.violations) ? block.violations : [];
  const violations = list
    .filter((v): v is { type: string; at: string } => {
      if (!v || typeof v !== 'object') return false;
      const o = v as { type?: string; at?: string };
      return Boolean(o.type && o.at);
    })
    .map((v) => ({
      type: String((v as { type: string }).type),
      at: String((v as { at: string }).at),
    }));
  return {
    violations,
    sessionId: typeof block.sessionId === 'string' ? block.sessionId : undefined,
    violationCount: Number(block.violationCount) || violations.length,
  };
}

function rowsFromAttempt(
  attempt: Record<string, unknown>,
): ProctorViolationRow[] {
  const userId = String(attempt.user_id ?? '');
  if (!userId) return [];

  const attemptId = attempt.id != null ? String(attempt.id) : null;
  const testId = attempt.test_id != null ? String(attempt.test_id) : null;
  const completedAt = String(attempt.completed_at ?? attempt.created_at ?? new Date().toISOString());
  const proctorCount = Number(attempt.proctor_violations ?? 0);
  const autoSubmit = Boolean(attempt.proctor_auto_submit);
  const sessionId =
    typeof attempt.proctor_session_id === 'string' ? attempt.proctor_session_id : undefined;
  const parsed = parseProctorFromAnswers(attempt.answers);
  const rows: ProctorViolationRow[] = [];

  if (parsed?.violations.length) {
    const attemptTotal = parsed.violationCount || parsed.violations.length;
    for (const v of parsed.violations) {
      rows.push({
        id: `attempt-${attemptId}-${v.type}-${v.at}`,
        user_id: userId,
        test_id: testId,
        attempt_id: attemptId,
        violation_type: v.type,
        metadata: {
          at: v.at,
          sessionId: parsed.sessionId ?? sessionId,
          violationCount: 1,
          attemptViolationTotal: attemptTotal,
        },
        created_at: v.at || completedAt,
        source: 'test_attempt',
      });
    }
  } else if (proctorCount > 0 || autoSubmit) {
    rows.push({
      id: `attempt-summary-${attemptId}`,
      user_id: userId,
      test_id: testId,
      attempt_id: attemptId,
      violation_type: autoSubmit ? 'auto_submit_violations' : 'proctor_summary',
      metadata: {
        violationCount: proctorCount || parsed?.violationCount || 0,
        sessionId: sessionId ?? parsed?.sessionId,
        autoSubmitted: autoSubmit,
      },
      created_at: completedAt,
      source: 'test_attempt',
    });
  }

  return rows;
}

function buildSummary(rows: ProctorViolationRow[]): ProctoringSummary {
  const byType = rows.reduce<Record<string, number>>((acc, row) => {
    const t = String(row.violation_type);
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: rows.length,
    byType,
    studentsFlagged: new Set(rows.map((r) => r.user_id)).size,
    autoSubmits:
      (byType.auto_submit_violations ?? 0) +
      rows.filter((r) => r.metadata?.autoSubmitted === true).length,
  };
}

function mergeViolationRows(primary: ProctorViolationRow[], fallback: ProctorViolationRow[]): ProctorViolationRow[] {
  const byKey = new Map<string, ProctorViolationRow>();
  for (const row of [...primary, ...fallback]) {
    const key = `${row.user_id}::${row.violation_type}::${row.created_at}::${row.attempt_id ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** College-wide or filtered proctoring rows (exam_violations + attempt fallbacks). */
export async function loadProctoringViolations(
  admin: DbServiceClient,
  options?: { userIds?: string[]; fromDate?: string | null; toDate?: string | null },
): Promise<{ violations: ProctorViolationRow[]; summary: ProctoringSummary; dateRange: ReturnType<typeof resolveIstDateRange> }> {
  const userFilter = options?.userIds?.length ? options.userIds : null;
  const dateRange = resolveIstDateRange(options?.fromDate, options?.toDate);

  let tableRows: ProctorViolationRow[] = [];
  const { data: violations, error: violationsErr } = await admin
    .from('exam_violations')
    .select('id, user_id, test_id, attempt_id, violation_type, metadata, created_at')
    .gte('created_at', dateRange.fromIso)
    .lte('created_at', dateRange.toIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (!violationsErr) {
    tableRows = (violations ?? [])
      .filter((row) => {
        if (!userFilter) return true;
        return userFilter.includes(String(row.user_id ?? ''));
      })
      .map((row) => ({
        id: String(row.id),
        user_id: String(row.user_id ?? ''),
        test_id: row.test_id != null ? String(row.test_id) : null,
        attempt_id: row.attempt_id != null ? String(row.attempt_id) : null,
        violation_type: String(row.violation_type),
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        created_at: String(row.created_at ?? new Date().toISOString()),
        source: 'exam_violations' as const,
      }))
      .filter((row) => isoFallsInIstDateRange(row.created_at, dateRange.fromIso, dateRange.toIso));
  }

  const attemptRows: ProctorViolationRow[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (offset < 15000) {
    let attemptQuery = admin
      .from('test_attempts')
      .select(
        'id, user_id, test_id, proctor_violations, proctor_auto_submit, proctor_session_id, answers, completed_at, created_at, status',
      )
      .gte('created_at', dateRange.fromIso)
      .lte('created_at', dateRange.toIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (userFilter) {
      attemptQuery = attemptQuery.in('user_id', userFilter);
    }

    let { data: attempts, error: attemptsErr } = await attemptQuery;

    if (attemptsErr && !isMissingTable(attemptsErr)) {
      let fallbackQuery = admin
        .from('test_attempts')
        .select('id, user_id, test_id, answers, completed_at, created_at, score, status')
        .gte('created_at', dateRange.fromIso)
        .lte('created_at', dateRange.toIso)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (userFilter) {
        fallbackQuery = fallbackQuery.in('user_id', userFilter);
      }
      const fallback = await fallbackQuery;
      attempts = fallback.data;
      attemptsErr = fallback.error;
    }

    const page = (attempts ?? []) as Record<string, unknown>[];
    if (attemptsErr || !page.length) break;

    for (const row of page) {
      const record = row as Record<string, unknown>;
      const count = Number(record.proctor_violations ?? 0);
      const auto = Boolean(record.proctor_auto_submit);
      const parsed = parseProctorFromAnswers(record.answers);
      const hasProctorInAnswers = Boolean(parsed?.violations.length);
      const inProgress = String(record.status ?? '').toLowerCase() === 'in_progress';
      if (count > 0 || auto || hasProctorInAnswers || (inProgress && parsed?.sessionId)) {
        const built = rowsFromAttempt(record).filter((r) =>
          isoFallsInIstDateRange(r.created_at, dateRange.fromIso, dateRange.toIso),
        );
        attemptRows.push(...built);
      }
    }

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const merged = mergeViolationRows(tableRows, attemptRows);
  return { violations: merged, summary: buildSummary(merged), dateRange };
}

export function isProctoringSchemaMissing(error: unknown): boolean {
  return isMissingTable(error);
}
