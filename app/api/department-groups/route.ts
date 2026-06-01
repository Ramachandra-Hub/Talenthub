import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { listDepartmentGroups } from '@/lib/department-groups';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ groups: [] });
  }

  const groups = await listDepartmentGroups(admin);
  return NextResponse.json({ groups });
}
