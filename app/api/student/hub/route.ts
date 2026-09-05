import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import { ensureDsaTables } from '@/lib/dsa/ensure-tables';
import { isUserAssignedToDsa } from '@/lib/dsa/roster';
import { COLLEGE } from '@/lib/college-brand';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  try {
    await ensureDsaTables().catch(() => undefined);

    const user = await prisma.user.findUnique({
      where: { id: auth.ctx.user.id },
      select: {
        fullName: true,
        rollNumber: true,
        branch: true,
        academicYear: true,
        email: true,
      },
    });

    const dsa = await isUserAssignedToDsa(auth.ctx.user.id);

    return NextResponse.json({
      college: COLLEGE.shortName,
      department: COLLEGE.departmentTitle,
      student: {
        name: user?.fullName?.trim() || 'Student',
        rollNumber: dsa.rollNumber || user?.rollNumber || '',
        branch: user?.branch ?? null,
        year: user?.academicYear ?? null,
      },
      paths: {
        exams: {
          id: 'exams',
          title: 'Examinations',
          subtitle: 'Live slots, timed papers, results',
          href: '/exams',
          available: true,
        },
        dsa: {
          id: 'dsa',
          title: 'DSA Practice',
          subtitle: 'Day-wise coding track & weekly qualification',
          href: '/dsa',
          available: dsa.assigned,
          unavailableReason: dsa.assigned
            ? null
            : 'Not assigned to your roll number. Contact Training & Placement if you believe this is an error.',
        },
      },
    });
  } catch (err) {
    console.error('[student/hub]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load student hub' },
      { status: 500 },
    );
  }
}
