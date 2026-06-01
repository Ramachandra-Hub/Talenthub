import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { loadAdminTestsOverview } from '@/lib/admin/tests-overview-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const payload = await loadAdminTestsOverview(admin);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tests';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
