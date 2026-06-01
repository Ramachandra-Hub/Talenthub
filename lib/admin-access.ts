/**
 * Admin user bootstrap and role checks — AWS RDS + Prisma only.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getDbService, type DbServiceClient } from '@/lib/db/get-db-service';

export function getAdminDb(): DbServiceClient {
  return getDbService();
}

/** @deprecated Use getAdminDb */
export const getAdminSupabase = getAdminDb;

export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true },
  });
  return user ? { id: user.id, email: user.email ?? undefined } : null;
}

export async function createConfirmedAuthUser(
  email: string,
  password: string,
  fullName: string,
): Promise<{ id: string } | { error: string }> {
  const normalized = email.toLowerCase();
  const existing = await findAuthUserByEmail(normalized);
  const hash = await bcrypt.hash(password, 12);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: hash, fullName, updatedAt: new Date() },
    });
    return { id: existing.id };
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash: hash,
        fullName,
        userRole: 'admin',
      },
    });
    return { id: user.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create admin user' };
  }
}

export async function upsertPublicUser(
  _db: DbServiceClient,
  userId: string,
  email: string,
  fullName: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: email.toLowerCase(),
        fullName,
        userRole: 'student',
      },
      update: { email: email.toLowerCase(), fullName, updatedAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'User upsert failed' };
  }
}

export async function grantAdminRole(
  _db: DbServiceClient,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.adminUser.upsert({
      where: { userId },
      create: { userId, role: 'admin' },
      update: { role: 'admin' },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { userRole: 'admin' },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Admin grant failed' };
  }
}

export async function isUserAdmin(_db: DbServiceClient, userId: string): Promise<boolean> {
  const row = await prisma.adminUser.findUnique({ where: { userId }, select: { id: true } });
  return !!row;
}
