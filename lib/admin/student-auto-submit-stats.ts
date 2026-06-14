import { getDbService } from '@/lib/db/get-db-service';
import { PROCTOR_MAX_VIOLATIONS } from '@/lib/exam-v2/proctoring-config';
import { resolveStoredPercent } from '@/lib/test-attempts';

export type StudentAutoSubmitStats = {
  auto_submit_count: number;
  zero_score_auto_submit_count: number;
  last_auto_submit_at: string | null;
  has_auto_submit: boolean;
  logged_in_with_auto_submit: boolean;
};

function parseProctorBlock(answers: unknown): {
  autoSubmitted: boolean;
  submitReason: string;
  hasAutoViolation: boolean;
  violationCount: number;
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
  const violationCount = Math.max(
    Number(block.violationCount) || 0,
    violations.length,
  );
  return {
    autoSubmitted: block.autoSubmitted === true,
    submitReason: String(block.submitReason ?? ''),
    hasAutoViolation,
    violationCount,
  };
}

function attemptScorePercent(row: Record<string, unknown>): number {
  const pct = row.percentage_score != null ? Number(row.percentage_score) : null;
  const score = row.score != null ? Number(row.score) : null;
  const total = row.total_score != null ? Number(row.total_score) : null;
  return resolveStoredPercent(
    Number.isFinite(pct) ? pct : null,
    Number.isFinite(score) ? score : null,
    Number.isFinite(total) ? total : null,
  );
}

export function attemptWasAutoSubmitted(row: Record<string, unknown>): boolean {
  if (row.proctor_auto_submit === true) return true;

  const proctorViolations = Number(row.proctor_violations ?? 0);
  if (proctorViolations >= PROCTOR_MAX_VIOLATIONS) return true;

  const proctor = parseProctorBlock(row.answers);
  if (proctor) {
    if (proctor.autoSubmitted) return true;
    if (proctor.hasAutoViolation) return true;
    if (proctor.violationCount >= PROCTOR_MAX_VIOLATIONS) return true;
    if (proctor.submitReason === 'proctor_violations' || proctor.submitReason === 'timeout') {
      return true;
    }
  }

  const status = String(row.status ?? '').toLowerCase();
  const completed =
    status === 'completed' ||
    status === 'submitted' ||
    row.completed_at != null;

  if (completed && proctorViolations > 0 && attemptScorePercent(row) <= 0.01) {
    return true;
  }

  return false;
}

function isLoggedInPendingAutoSubmit(
  row: Record<string, unknown>,
  portalActive: boolean,
): boolean {
  if (!portalActive) return false;
  const status = String(row.status ?? '').toLowerCase();
  if (status !== 'in_progress' && status !== 'started' && status !== 'active') {
    return false;
  }

  const proctorViolations = Number(row.proctor_violations ?? 0);
  if (proctorViolations >= PROCTOR_MAX_VIOLATIONS) return true;

  const proctor = parseProctorBlock(row.answers);
  if (!proctor) return false;
  if (proctor.autoSubmitted) return true;
  if (proctor.hasAutoViolation) return true;
  return proctor.violationCount >= PROCTOR_MAX_VIOLATIONS;
}

/** Students who had at least one exam auto-submitted (proctor, timer, or 0% submit). */
export async function loadStudentAutoSubmitMap(
  userIds: string[],
  activePortalUserIds?: Set<string>,
): Promise<Map<string, StudentAutoSubmitStats>> {
  const out = new Map<string, StudentAutoSubmitStats>();
  if (!userIds.length) return out;

  const idSet = new Set(userIds);
  const portalActive = activePortalUserIds ?? new Set<string>();
  const admin = getDbService();
  if (!admin) return out;

  const bump = (userId: string, at: string, score: number, loggedIn = false) => {
    if (!idSet.has(userId)) return;
    const cur =
      out.get(userId) ??
      ({
        auto_submit_count: 0,
        zero_score_auto_submit_count: 0,
        last_auto_submit_at: null,
        has_auto_submit: false,
        logged_in_with_auto_submit: false,
      } satisfies StudentAutoSubmitStats);

    cur.auto_submit_count += 1;
    if (score <= 0.01) cur.zero_score_auto_submit_count += 1;
    if (loggedIn) cur.logged_in_with_auto_submit = true;
    cur.has_auto_submit = true;
    if (
      !cur.last_auto_submit_at ||
      new Date(at).getTime() > new Date(cur.last_auto_submit_at).getTime()
    ) {
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
      bump(
        String(row.user_id ?? ''),
        String(row.created_at ?? new Date().toISOString()),
        0,
      );
    }
  } catch {
    // exam_violations may be missing on older DBs
  }

  let from = 0;
  const pageSize = 1000;
  while (from < 25000) {
    let page: Record<string, unknown>[] = [];
    const fullSelect =
      'user_id, proctor_auto_submit, proctor_violations, answers, completed_at, created_at, status, score, percentage_score, total_score';
    const { data, error } = await admin
      .from('test_attempts')
      .select(fullSelect)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (!error && data?.length) {
      page = data as Record<string, unknown>[];
    } else {
      const fallback = await admin
        .from('test_attempts')
        .select('user_id, proctor_auto_submit, answers, completed_at, created_at, status, score, percentage_score, total_score')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      page = (fallback.data ?? []) as Record<string, unknown>[];
      if (fallback.error) break;
    }

    if (!page.length) break;

    for (const row of page) {
      const userId = String(row.user_id ?? '');
      if (!idSet.has(userId)) continue;
      const at = String(row.completed_at ?? row.created_at ?? new Date().toISOString());
      const score = attemptScorePercent(row);
      const portalActiveUser = portalActive.has(userId);

      if (attemptWasAutoSubmitted(row)) {
        bump(userId, at, score, portalActiveUser);
        continue;
      }

      if (isLoggedInPendingAutoSubmit(row, portalActiveUser)) {
        bump(userId, at, score, true);
      }
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return out;
}
