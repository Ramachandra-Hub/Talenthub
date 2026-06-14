import { NextResponse } from 'next/server';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { getStudentPortalSessionMap } from '@/lib/admin/student-portal-session-admin';
import { loadStudentScoreStatsMap } from '@/lib/admin/user-score-stats';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  roll_number: string | null;
  branch: string | null;
  academic_year: string | null;
  user_role: string | null;
  created_at: string | null;
  portal_session: {
    active: boolean;
    last_heartbeat: string | null;
    locked_at: string | null;
  };
  attempt_count?: number;
  completed_count?: number;
  best_score?: number;
  avg_score?: number;
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
        rollNumber: true,
        branch: true,
        academicYear: true,
        userRole: true,
        createdAt: true,
      },
    });

    const studentRows = rows.filter(
      (u) => !adminIds.has(u.id) && u.email && !u.email.includes('@admin.'),
    );
    const studentIds = studentRows
      .filter((u) => (u.userRole ?? 'student') !== 'faculty')
      .map((u) => u.id);
    const [sessionMap, scoreStatsMap] = await Promise.all([
      getStudentPortalSessionMap(studentIds),
      loadStudentScoreStatsMap(studentIds),
    ]);

    const users: AdminUserRow[] = studentRows.map((u) => {
      const session = sessionMap.get(u.id);
      const scores = scoreStatsMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        roll_number: u.rollNumber?.trim() || rollNumberFromUser(u.email) || null,
        branch: u.branch,
        academic_year: u.academicYear,
        user_role: u.userRole ?? 'student',
        created_at: u.createdAt.toISOString(),
        portal_session: {
          active: session?.active ?? false,
          last_heartbeat: session?.last_heartbeat ?? null,
          locked_at: session?.locked_at ?? null,
        },
        attempt_count: scores?.attempt_count ?? 0,
        completed_count: scores?.completed_count ?? 0,
        best_score: scores?.best_score ?? 0,
        avg_score: scores?.avg_score ?? 0,
      };
    });

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
