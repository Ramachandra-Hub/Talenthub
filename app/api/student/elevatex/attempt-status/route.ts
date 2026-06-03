import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  findCompletedElevateXAttempt,
  normalizeRollNumber,
} from '@/lib/elevatex/completed-attempt';
import { fetchElevateXTechnicalFormatForDepartment } from '@/lib/elevatex-admin';
import { getDbService } from '@/lib/db/get-db-service';
import { placementDepartmentIdFromBranch } from '@/lib/placement/student-candidate';
import { resolveStudentProfilePrisma } from '@/lib/db/test-attempts-prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const rollParam = url.searchParams.get('rollNumber')?.trim() ?? '';
    let rollNumber = rollParam ? normalizeRollNumber(rollParam) : '';

    const profile = await resolveStudentProfilePrisma(session.user.id);
    if (!rollNumber) {
      rollNumber = profile.roll_number ? normalizeRollNumber(profile.roll_number) : '';
    }

    const departmentId = placementDepartmentIdFromBranch(profile.branch);

    const admin = getDbService();
    let technicalFormat = undefined as Awaited<
      ReturnType<typeof fetchElevateXTechnicalFormatForDepartment>
    > | undefined;
    if (admin) {
      technicalFormat = await fetchElevateXTechnicalFormatForDepartment(admin, departmentId);
    }

    const prior = await findCompletedElevateXAttempt({
      userId: session.user.id,
      rollNumber: rollNumber || undefined,
    });

    if (!prior) {
      return NextResponse.json({
        completed: false,
        departmentId,
        technicalFormat,
      });
    }

    return NextResponse.json({
      completed: true,
      attemptId: prior.id,
      score: prior.score,
      completedAt: prior.completed_at,
      departmentId,
      technicalFormat,
    });
  } catch (err) {
    console.error('[elevatex/attempt-status]', err);
    return NextResponse.json({ completed: false });
  }
}
