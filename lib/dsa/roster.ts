import { prisma } from '@/lib/prisma';
import { ensureDsaTables } from '@/lib/dsa/ensure-tables';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { academicYearsMatch } from '@/lib/academic-year-match';

export function normalizeDsaRoll(roll: string): string {
  return roll.trim().toUpperCase().replace(/\s+/g, '');
}

/** IV / 4th year students get DSA Arena practice without a roster row. */
export function isFourthYearForDsa(academicYear: string | null | undefined): boolean {
  return academicYearsMatch(academicYear, 'IV Year');
}

export async function isRollAssignedToDsa(rollNumber: string | null | undefined): Promise<boolean> {
  const roll = rollNumber ? normalizeDsaRoll(rollNumber) : '';
  if (!roll) return false;
  await ensureDsaTables();
  try {
    const row = await prisma.dsaRosterEntry.findFirst({
      where: { rollNumber: roll, isActive: true },
      select: { id: true },
    });
    return Boolean(row);
  } catch {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "dsa_roster"
      WHERE UPPER(REPLACE("roll_number", ' ', '')) = ${roll}
        AND "is_active" = true
      LIMIT 1
    `;
    return rows.length > 0;
  }
}

export async function isUserAssignedToDsa(userId: string): Promise<{
  assigned: boolean;
  rollNumber: string;
  fullName: string | null;
  via: 'roster' | 'iv_year' | 'none';
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rollNumber: true, fullName: true, email: true, academicYear: true },
  });
  const roll =
    (user?.rollNumber ? normalizeDsaRoll(user.rollNumber) : '') ||
    normalizeDsaRoll(rollNumberFromUser(user?.email ?? ''));

  if (isFourthYearForDsa(user?.academicYear)) {
    return {
      assigned: true,
      rollNumber: roll,
      fullName: user?.fullName ?? null,
      via: 'iv_year',
    };
  }

  const onRoster = await isRollAssignedToDsa(roll);
  return {
    assigned: onRoster,
    rollNumber: roll,
    fullName: user?.fullName ?? null,
    via: onRoster ? 'roster' : 'none',
  };
}

export async function assertUserAssignedToDsa(userId: string): Promise<void> {
  const { assigned } = await isUserAssignedToDsa(userId);
  if (!assigned) {
    const err = new Error(
      'DSA Arena is available to IV Year (4th year) students, or rolls assigned by faculty.',
    );
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}
