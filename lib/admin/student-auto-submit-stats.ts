import { getDbService } from '@/lib/db/get-db-service';

export type StudentAutoSubmitStats = {
  auto_submit_count: number;
  last_auto_submit_at: string | null;
};

function parseProctorBlock(answers: unknown): {
  autoSubmitted: boolean;
  submitReason: string;
  hasAutoViolation: boolean;
} | null {
  if (!answers || typeof answers !== 'object') return null;
  const proctor = (answers as Record<string, unknown>).__proctor;
  if (!proctor || typeof proctor !== 'object') return null;
  const block = proctor as Record<string, unknown>;
  const violations = Array.isArray(block.violations) ? block.violations : [];
  const hasAutoViolation = violations.some((v) => {
    if (!v || typeof v !== 'object') return false;
    const type = String((v as { type?: string }).type ?? '');
    return type.includes('auto_submit');
  });
  return {
    autoSubmitted: block.autoSubmitted === true,
    submitReason: String(block.submitReason ?? ''),
    hasAutoViolation,
  };
}

export function attemptWasAutoSubmitted(row: Record<string, unknown>): boolean {
  if (row.proctor_auto_submit === true) return true;

  const proctor = parseProctorBlock(row.answers);
  if (!proctor) return false;
  if (proctor.autoSubmitted) return true;
  if (proctor.hasAutoViolation) return true;
  if (proctor.submitReason === 'proctor_violations' || proctor.submitReason === 'timeout') {
    return true;
  }
  return false;
}

/** Students who had at least one exam auto-submitted (proctor or timer). */
export async function loadStudentAutoSubmitMap(
  userIds: string[],
): Promise<Map<string, StudentAutoSubmitStats>> {
  const out = new Map<string, StudentAutoSubmitStats>();
  if (!userIds.length) return out;

  const idSet = new Set(userIds);
  const admin = getDbService();
  if (!admin) return out;

  const bump = (userId: string, at: string) => {
    if (!idSet.has(userId)) return;
    const cur = out.get(userId) ?? { auto_submit_count: 0, last_auto_submit_at: null };
    cur.auto_submit_count += 1;
    if (!cur.last_auto_submit_at || new Date(at).getTime() > new Date(cur.last_auto_submit_at).getTime()) {
      cur.last_auto_submit_at = at;
    }
    out.set(userId, cur);
  };

  try {
    const { data: violations } = await admin
      .from('exam_violations')
      .select('user_id, created_at, violation_type')
      .order('created_at', { ascending: false })
      .limit(5000);

    for (const row of violations ?? []) {
      const type = String(row.violation_type ?? '').toLowerCase();
      if (!type.includes('auto_submit')) continue;
      bump(String(row.user_id ?? ''), String(row.created_at ?? new Date().toISOString()));
    }
  } catch {
    // exam_violations may be missing on older DBs
  }

  let from = 0;
  const pageSize = 1000;
  while (from < 25000) {
    const { data, error } = await admin
      .from('test_attempts')
      .select('user_id, proctor_auto_submit, answers, completed_at, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;
    const page = (data ?? []) as Record<string, unknown>[];
    if (!page.length) break;

    for (const row of page) {
      const userId = String(row.user_id ?? '');
      if (!idSet.has(userId)) continue;
      if (!attemptWasAutoSubmitted(row)) continue;
      const at = String(row.completed_at ?? row.created_at ?? new Date().toISOString());
      bump(userId, at);
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return out;
}
