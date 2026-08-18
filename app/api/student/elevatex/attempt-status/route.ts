import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  findCompletedElevateXAttempt,
  normalizeRollNumber,
} from '@/lib/elevatex/completed-attempt';
import { fetchElevateXExamConfigForDepartment } from '@/lib/elevatex-admin';
import { getDbService } from '@/lib/db/get-db-service';
import { placementDepartmentIdFromBranch } from '@/lib/placement/student-candidate';
import { resolveStudentProfilePrisma } from '@/lib/db/test-attempts-prisma';
import { isElevateXExamWindowOpenPrisma } from '@/lib/elevatex/exam-window';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const rollParam = url.searchParams.get('rollNumber')?.trim() ?? '';
    const examNameParam = url.searchParams.get('examName')?.trim() ?? '';
    let rollNumber = rollParam ? normalizeRollNumber(rollParam) : '';

    const profile = await resolveStudentProfilePrisma(session.user.id);
    if (!rollNumber) {
      rollNumber = profile.roll_number ? normalizeRollNumber(profile.roll_number) : '';
    }

    const departmentId = placementDepartmentIdFromBranch(profile.branch);

    const admin = getDbService();
    let examConfig:
      | Awaited<ReturnType<typeof fetchElevateXExamConfigForDepartment>>
      | undefined;
    if (admin) {
      examConfig = await fetchElevateXExamConfigForDepartment(admin, departmentId);
    }

    const examWindowOpen = await isElevateXExamWindowOpenPrisma();

    const prior = await findCompletedElevateXAttempt({
      userId: session.user.id,
      rollNumber: rollNumber || undefined,
      examName: examNameParam || undefined,
    });

    const payload = {
      examWindowOpen,
      departmentId,
      technicalFormat: examConfig?.technicalFormat,
      enabledSections: examConfig?.enabledSections,
      examTotalMarks: examConfig?.examTotalMarks,
      examDurationSec: examConfig?.examDurationSec,
      programmingDefaultLanguage: examConfig?.programmingDefaultLanguage,
      programmingProblemCount: examConfig?.programmingProblems.length ?? 0,
      programmingProblems: examConfig?.enabledSections.includes('programming')
        ? examConfig?.programmingProblems ?? []
        : [],
    };

    if (!prior) {
      return NextResponse.json({
        completed: false,
        ...payload,
      });
    }

    return NextResponse.json({
      completed: true,
      attemptId: prior.id,
      score: prior.score,
      completedAt: prior.completed_at,
      ...payload,
    });
  } catch (err) {
    console.error('[elevatex/attempt-status]', err);
    return NextResponse.json(
      {
        completed: false,
        statusError: true,
        error: 'Could not verify ElevateX status. Try again in a moment.',
      },
      { status: 503 },
    );
  }
}
