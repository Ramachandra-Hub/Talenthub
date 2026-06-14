import { prisma } from '@/lib/prisma';

export type DeleteStudentResult = {
  deleted: boolean;
  userId: string;
  label: string;
  attemptsDeleted: number;
  violationsDeleted: number;
  codingSubmissionsDeleted: number;
  rosterEntriesDeleted: number;
};

async function getDeleteGuard(
  userId: string,
): Promise<{ ok: true; user: { id: string; email: string; fullName: string | null; rollNumber: string | null } } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, rollNumber: true, userRole: true },
  });
  if (!user) return { ok: false, error: 'Student not found' };
  if (user.email?.includes('@admin.')) return { ok: false, error: 'Cannot delete an admin account.' };
  if (user.userRole === 'admin') return { ok: false, error: 'Cannot delete an admin account.' };
  if (user.userRole === 'faculty') return { ok: false, error: 'Cannot delete a faculty account from Users.' };

  const adminRow = await prisma.adminUser.findUnique({
    where: { userId },
    select: { userId: true },
  });
  if (adminRow) return { ok: false, error: 'Cannot delete an admin account.' };

  return { ok: true, user };
}

/** Permanently remove a student and related data from the application. */
export async function deleteStudentFromApplication(
  userId: string,
  options?: { preserveRoster?: boolean },
): Promise<DeleteStudentResult | { error: string }> {
  const guard = await getDeleteGuard(userId);
  if (!guard.ok) return { error: guard.error };

  const { user } = guard;
  const label = user.rollNumber?.trim() || user.fullName?.trim() || user.email;

  const violations = await prisma.examViolation.deleteMany({ where: { userId } });
  const coding = await prisma.codingSubmission.deleteMany({ where: { userId } });

  let rosterEntriesDeleted = 0;
  const roll = user.rollNumber?.trim();
  if (roll && !options?.preserveRoster) {
    const roster1 = await prisma.examStudentRoster.deleteMany({ where: { rollNumber: roll } });
    const roster2 = await prisma.examSlotRosterEntry.deleteMany({ where: { rollNumber: roll } });
    rosterEntriesDeleted = roster1.count + roster2.count;
  }

  const attemptCount = await prisma.testAttempt.count({ where: { userId } });

  await prisma.user.delete({ where: { id: userId } });

  return {
    deleted: true,
    userId,
    label,
    attemptsDeleted: attemptCount,
    violationsDeleted: violations.count,
    codingSubmissionsDeleted: coding.count,
    rosterEntriesDeleted,
  };
}

export async function deleteStudentsFromApplication(
  userIds: string[],
  options?: { preserveRoster?: boolean },
): Promise<{
  deleted: number;
  results: Array<DeleteStudentResult | { userId: string; error: string }>;
}> {
  const uniqueIds = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const results: Array<DeleteStudentResult | { userId: string; error: string }> = [];
  let deleted = 0;

  for (const userId of uniqueIds) {
    const outcome = await deleteStudentFromApplication(userId, options);
    if ('error' in outcome) {
      results.push({ userId, error: outcome.error });
    } else {
      deleted += 1;
      results.push(outcome);
    }
  }

  return { deleted, results };
}
