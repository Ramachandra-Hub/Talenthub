import type { DbServiceClient } from '@/lib/db/get-db-service';
import { readServiceError } from '@/lib/db/service-error';

export type ResetAllStudentsResult = {
  authUsersDeleted: number;
  profileRowsDeleted: number;
  attemptsDeleted: number;
  violationsDeleted: number;
  sessionsCleared: number;
  rosterRowsCleared: number;
  slotRosterRowsCleared: number;
  dashboardStatsCleared: number;
  errors: string[];
};

function isProtectedAccount(email: string, metadata: Record<string, unknown>): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.includes('@admin.')) return true;
  if (String(metadata.role ?? '').toLowerCase() === 'admin') return true;
  return false;
}

async function listAllAuthUsers(
  db: DbServiceClient,
): Promise<Array<{ id: string; email: string; metadata: Record<string, unknown> }>> {
  const users: Array<{ id: string; email: string; metadata: Record<string, unknown> }> = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(readServiceError(error) ?? 'listUsers failed');
    if (!data?.users?.length) break;
    for (const user of data.users) {
      users.push({
        id: user.id,
        email: user.email ?? '',
        metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
      });
    }
    if (data.users.length < 200) break;
  }
  return users;
}

/** Remove every student/faculty login and wipe attempt/roster data. Keeps admin accounts only. */
export async function resetAllStudentsForExamDay(
  db: DbServiceClient,
): Promise<ResetAllStudentsResult> {
  const errors: string[] = [];
  const result: ResetAllStudentsResult = {
    authUsersDeleted: 0,
    profileRowsDeleted: 0,
    attemptsDeleted: 0,
    violationsDeleted: 0,
    sessionsCleared: 0,
    rosterRowsCleared: 0,
    slotRosterRowsCleared: 0,
    dashboardStatsCleared: 0,
    errors,
  };

  const { count: violCount, error: violErr } = await db
    .from('exam_violations')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (violErr) errors.push(`exam_violations: ${violErr.message}`);
  else result.violationsDeleted = violCount ?? 0;

  const { count: attemptCount, error: attemptErr } = await db
    .from('test_attempts')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (attemptErr) errors.push(`test_attempts: ${attemptErr.message}`);
  else result.attemptsDeleted = attemptCount ?? 0;

  const { count: statsCount, error: statsErr } = await db
    .from('student_dashboard_stats')
    .delete({ count: 'exact' })
    .not('user_id', 'is', null);
  if (statsErr) errors.push(`student_dashboard_stats: ${statsErr.message}`);
  else result.dashboardStatsCleared = statsCount ?? 0;

  const { count: sessionCount, error: sessionErr } = await db
    .from('student_active_sessions')
    .delete({ count: 'exact' })
    .neq('roll_number', '');
  if (sessionErr) errors.push(`student_active_sessions: ${sessionErr.message}`);
  else result.sessionsCleared = sessionCount ?? 0;

  const { count: rosterCount, error: rosterErr } = await db
    .from('exam_student_roster')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (rosterErr) errors.push(`exam_student_roster: ${rosterErr.message}`);
  else result.rosterRowsCleared = rosterCount ?? 0;

  const { count: slotRosterCount, error: slotRosterErr } = await db
    .from('exam_slot_roster_entries')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (slotRosterErr) errors.push(`exam_slot_roster_entries: ${slotRosterErr.message}`);
  else result.slotRosterRowsCleared = slotRosterCount ?? 0;

  let authUsers: Awaited<ReturnType<typeof listAllAuthUsers>>;
  try {
    authUsers = await listAllAuthUsers(db);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Failed to list auth users');
    return result;
  }

  const protectedIds = new Set<string>();
  for (const user of authUsers) {
    if (isProtectedAccount(user.email, user.metadata)) {
      protectedIds.add(user.id);
    }
  }

  for (const user of authUsers) {
    if (protectedIds.has(user.id)) continue;
    const { error: delErr } = await db.auth.admin.deleteUser(user.id);
    if (delErr) {
      errors.push(`auth ${user.email || user.id}: ${readServiceError(delErr) ?? 'delete failed'}`);
      continue;
    }
    result.authUsersDeleted += 1;
  }

  const { data: profileRows, error: profileListErr } = await db
    .from('users')
    .select('id, email, user_role');
  if (profileListErr) {
    errors.push(`users list: ${profileListErr.message}`);
    return result;
  }

  for (const row of profileRows ?? []) {
    const id = String(row.id);
    if (protectedIds.has(id)) continue;
    const email = String(row.email ?? '');
    const role = String(row.user_role ?? '').toLowerCase();
    if (email.includes('@admin.') || role === 'admin') continue;
    const { error: profileDelErr } = await db.from('users').delete().eq('id', id);
    if (profileDelErr) {
      errors.push(`profile ${email || id}: ${profileDelErr.message}`);
      continue;
    }
    result.profileRowsDeleted += 1;
  }

  return result;
}
