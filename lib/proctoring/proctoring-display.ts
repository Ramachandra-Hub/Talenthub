export type ProctoringDisplayRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  roll_number: string | null;
  branch: string | null;
  violation_type: string;
  test_id: string | null;
  attempt_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  violation_count: number;
  attempt_violation_total: number;
  student_violation_total: number;
  auto_submitted: boolean;
};

export function resolveIncidentViolationCount(
  violationType: string,
  metadata: Record<string, unknown> | null | undefined,
): number {
  const meta = metadata ?? {};
  const stored = Number(meta.violationCount);
  if (
    (violationType === 'proctor_summary' || violationType.includes('auto_submit')) &&
    Number.isFinite(stored) &&
    stored > 0
  ) {
    return Math.floor(stored);
  }
  return 1;
}

export function enrichProctoringDisplayRows<
  T extends {
    id: string;
    user_id: string;
    violation_type: string;
    attempt_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    test_id: string | null;
    email?: string | null;
    full_name?: string | null;
    roll_number?: string | null;
    branch?: string | null;
  },
>(rows: T[]): ProctoringDisplayRow[] {
  const studentTotals = new Map<string, number>();
  const attemptTotals = new Map<string, number>();

  const counts = rows.map((row) => {
    const count = resolveIncidentViolationCount(row.violation_type, row.metadata);
    const attemptKey = `${row.user_id}::${row.attempt_id ?? 'none'}`;
    studentTotals.set(row.user_id, (studentTotals.get(row.user_id) ?? 0) + count);
    attemptTotals.set(attemptKey, (attemptTotals.get(attemptKey) ?? 0) + count);
    const attemptTotalFromMeta = Number(row.metadata?.attemptViolationTotal);
    return {
      row,
      count,
      attemptKey,
      attemptTotalFromMeta:
        Number.isFinite(attemptTotalFromMeta) && attemptTotalFromMeta > 0
          ? Math.floor(attemptTotalFromMeta)
          : null,
    };
  });

  return counts.map(({ row, count, attemptKey, attemptTotalFromMeta }) => {
    const autoSubmitted =
      row.violation_type.includes('auto_submit') || row.metadata?.autoSubmitted === true;
    return {
      id: row.id,
      user_id: row.user_id,
      email: row.email ?? null,
      full_name: row.full_name ?? null,
      roll_number: row.roll_number ?? null,
      branch: row.branch ?? null,
      violation_type: row.violation_type,
      test_id: row.test_id,
      attempt_id: row.attempt_id,
      metadata: row.metadata,
      created_at: row.created_at,
      violation_count: count,
      attempt_violation_total:
        attemptTotalFromMeta ?? attemptTotals.get(attemptKey) ?? count,
      student_violation_total: studentTotals.get(row.user_id) ?? count,
      auto_submitted: autoSubmitted,
    };
  });
}
