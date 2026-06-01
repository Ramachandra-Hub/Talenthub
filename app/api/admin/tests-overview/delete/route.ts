import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { deleteAdminTestOverviewItem } from '@/lib/admin/delete-test-overview-item';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let body: { overviewId?: string };
  try {
    body = (await request.json()) as { overviewId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const overviewId = String(body.overviewId ?? '').trim();
  if (!overviewId) {
    return NextResponse.json({ error: 'overviewId is required' }, { status: 400 });
  }

  const result = await deleteAdminTestOverviewItem(admin, overviewId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
