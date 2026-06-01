import type { DbServiceClient } from '@/lib/db/get-db-service';
import { isAllowlistedAdminEmail } from '@/lib/admin-defaults';

function isMissingAdminTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('admin_users') &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find'))
  );
}

/** RDS/EC2 misconfiguration — do not treat as "not an admin". */
function isDatabaseConnectionError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('pg_hba') ||
    m.includes('no encryption') ||
    m.includes('econnrefused') ||
    m.includes('connection refused') ||
    m.includes('database_url is not configured') ||
    m.includes("can't reach database server") ||
    m.includes('unrecognized configuration parameter') ||
    m.includes('connection_limit') ||
    m.includes('etimedout') ||
    m.includes('timeout')
  );
}

/** Grant admin when DB table is unavailable but email is allowlisted (dev / migration recovery). */
export async function ensureAdminAccess(
  admin: DbServiceClient,
  userId: string,
  email: string | undefined,
): Promise<{ isAdmin: boolean; via: 'table' | 'allowlist' | 'none' }> {
  const { data, error } = await admin
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) {
    return { isAdmin: true, via: 'table' };
  }

  const errMsg = String(error?.message ?? '');
  if (error && isDatabaseConnectionError(errMsg) && isAllowlistedAdminEmail(email)) {
    return { isAdmin: true, via: 'allowlist' };
  }

  if (error && !isMissingAdminTableError(errMsg)) {
    return { isAdmin: false, via: 'none' };
  }

  if (!isAllowlistedAdminEmail(email)) {
    return { isAdmin: false, via: 'none' };
  }

  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role: 'admin', full_name: 'Main Admin' },
  });

  const { error: insertError } = await admin
    .from('admin_users')
    .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id' });

  if (!insertError) {
    return { isAdmin: true, via: 'table' };
  }

  return { isAdmin: true, via: 'allowlist' };
}

export async function checkIsAdmin(
  admin: DbServiceClient | null,
  userId: string,
  email: string | undefined,
): Promise<boolean> {
  if (!admin) {
    return isAllowlistedAdminEmail(email);
  }
  const result = await ensureAdminAccess(admin, userId, email);
  return result.isAdmin;
}
