import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let body: { name?: string; description?: string; departments?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
  }

  const departments = Array.from(
    new Set((body.departments ?? []).map((d) => String(d).trim()).filter(Boolean)),
  );
  if (departments.length === 0) {
    return NextResponse.json({ error: 'Add at least one department to the group' }, { status: 400 });
  }

  const { data: group, error: groupErr } = await admin
    .from('department_groups')
    .insert({ name, description: body.description?.trim() ?? null })
    .select('id, name, description')
    .single();

  if (groupErr || !group) {
    return NextResponse.json({ error: groupErr?.message ?? 'Could not create group' }, { status: 500 });
  }

  const { error: memberErr } = await admin.from('department_group_members').insert(
    departments.map((department) => ({
      group_id: group.id,
      department,
    })),
  );

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      departments,
    },
  });
}
