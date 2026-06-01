import { NextResponse } from 'next/server';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

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

  try {
    const adminIds = new Set(
      (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
    );

    const rows = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        email: true,
        fullName: true,
        branch: true,
        academicYear: true,
        userRole: true,
        createdAt: true,
      },
    });

    const users: AdminUserRow[] = rows
      .filter((u) => !adminIds.has(u.id) && u.email && !u.email.includes('@admin.'))
      .map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        branch: u.branch,
        academic_year: u.academicYear,
        user_role: u.userRole ?? 'student',
        created_at: u.createdAt.toISOString(),
      }));

    const students = users.filter((u) => u.user_role !== 'faculty');

    return NextResponse.json({
      users,
      students,
      total: users.length,
      studentCount: students.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { code, remediation } = classifyDatabaseError(message);
    console.error('[api/admin/users]', message);
    return NextResponse.json(
      {
        error: 'Could not load users',
        db_error: code,
        hint: remediation[0] ?? message,
      },
      { status: 500 },
    );
  }
}
