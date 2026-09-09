import { academicYearsMatch } from '@/lib/academic-year-match';
import { prisma } from '@/lib/prisma';

/**
 * Server-side IV Year eligibility for DSA Arena coding contests.
 * Never trust client-supplied year.
 */
export async function assertDsaCodingContestEligible(userId: string): Promise<{
  academicYear: string | null;
  rollNumber: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { academicYear: true, rollNumber: true },
  });
  if (!user) {
    const err = new Error('Student not found');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (!academicYearsMatch(user.academicYear, 'IV Year')) {
    const err = new Error(
      'DSA Arena coding contests are available only to IV Year students.',
    );
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return { academicYear: user.academicYear, rollNumber: user.rollNumber };
}

export async function isDsaCodingContestEligible(userId: string): Promise<boolean> {
  try {
    await assertDsaCodingContestEligible(userId);
    return true;
  } catch {
    return false;
  }
}
