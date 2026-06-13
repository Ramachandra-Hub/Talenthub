import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getStudentExamWindowStatusPrisma } from '@/lib/exam-window-status';
import { resolveStudentProfilePrisma } from '@/lib/db/test-attempts-prisma';
import { rollNumberFromUser } from '@/lib/admin/roll-number';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const url = new URL(request.url);
  const testId = url.searchParams.get('testId')?.trim() ?? '';
  if (!testId) {
    return NextResponse.json({ error: 'testId is required' }, { status: 400 });
  }

  const profile = await resolveStudentProfilePrisma(auth.ctx.user.id);
  const rollNumber =
    profile.roll_number ?? rollNumberFromUser(profile.email ?? auth.ctx.user.email ?? '', null);

  const status = await getStudentExamWindowStatusPrisma({
    testId,
    department: profile.branch ?? auth.ctx.resolved.department ?? '',
    year: profile.academic_year ?? auth.ctx.resolved.academicYear ?? '',
    rollNumber: rollNumber || undefined,
  });

  return NextResponse.json(status);
}
