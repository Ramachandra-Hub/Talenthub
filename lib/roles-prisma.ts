import type { AppRole, ResolvedUser } from '@/lib/roles';
import { prisma } from '@/lib/prisma';

export async function resolveAppUserById(userId: string): Promise<ResolvedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { adminUser: true },
  });

  if (!user) return null;

  if (user.adminUser) {
    return {
      id: user.id,
      email: user.email,
      role: 'admin',
    };
  }

  return {
    id: user.id,
    email: user.email,
    role: 'student',
    department: user.branch,
    academicYear: user.academicYear,
    employeeId: user.rollNumber,
  };
}

export async function resolveAppUserByEmail(email: string): Promise<ResolvedUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { adminUser: true },
  });
  if (!user) return null;
  return resolveAppUserById(user.id);
}

export async function ensureAdminUser(userId: string): Promise<void> {
  const existing = await prisma.adminUser.findUnique({ where: { userId } });
  if (existing) return;
  await prisma.adminUser.create({
    data: { userId, role: 'admin' },
  });
}

export function roleAllows(allowed: AppRole[] | undefined, role: AppRole): boolean {
  if (!allowed) return true;
  return allowed.includes(role);
}
