import { prisma } from '@/lib/prisma';
import { ensureDsaTables } from '@/lib/dsa/ensure-tables';
import { rollNumberFromUser } from '@/lib/admin/roll-number';

export function normalizeDsaRoll(roll: string): string {
  return roll.trim().toUpperCase().replace(/\s+/g, '');
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
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rollNumber: true, fullName: true, email: true },
  });
  const roll =
    (user?.rollNumber ? normalizeDsaRoll(user.rollNumber) : '') ||
    normalizeDsaRoll(rollNumberFromUser(user?.email ?? ''));
  const assigned = await isRollAssignedToDsa(roll);
  return { assigned, rollNumber: roll, fullName: user?.fullName ?? null };
}

export async function assertUserAssignedToDsa(userId: string): Promise<void> {
  const { assigned } = await isUserAssignedToDsa(userId);
  if (!assigned) {
    const err = new Error('DSA practice is not assigned to your roll number.');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}
