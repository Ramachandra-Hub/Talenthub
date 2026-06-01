import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { studentFieldsFromMetadata } from '@/lib/student-profile-sync';

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  branch: string | null;
  academic_year: string | null;
  user_role: string | null;
  created_at: string | null;
};

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const byId = new Map<string, AdminUserRow>();

  const { data: dbUsers, error: dbErr } = await admin
    .from('users')
    .select('id, email, full_name, branch, academic_year, user_role, created_at')
    .order('created_at', { ascending: false });

  if (dbErr && !dbErr.message.includes('users')) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  for (const row of dbUsers ?? []) {
    byId.set(row.id as string, {
      id: row.id as string,
      email: String(row.email ?? ''),
      full_name: (row.full_name as string | null) ?? null,
      branch: (row.branch as string | null) ?? null,
      academic_year: (row.academic_year as string | null) ?? null,
      user_role: (row.user_role as string | null) ?? 'student',
      created_at: (row.created_at as string | null) ?? null,
    });
  }

  let page = 1;
  const perPage = 200;
  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.users?.length) break;

    for (const user of data.users) {
      if (byId.has(user.id)) continue;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const role = String(meta.role ?? 'student');
      if (role === 'admin') continue;

      const fields = studentFieldsFromMetadata(meta, user.email);
      byId.set(user.id, {
        id: user.id,
        email: user.email ?? '',
        full_name: fields.full_name,
        branch: fields.branch,
        academic_year: fields.academic_year,
        user_role: role === 'faculty' ? 'faculty' : 'student',
        created_at: user.created_at ?? null,
      });
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  const users = Array.from(byId.values()).sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );

  const students = users.filter((u) => u.user_role !== 'faculty');

  return NextResponse.json({
    users,
    students,
    total: users.length,
    studentCount: students.length,
  });
}
