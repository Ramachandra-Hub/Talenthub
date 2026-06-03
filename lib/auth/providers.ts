import Credentials from 'next-auth/providers/credentials';
import type { Provider } from 'next-auth/providers';
import { prisma } from '@/lib/prisma';
import { ensureSchemaForAuth } from '@/lib/db/ensure-schema-for-auth';
import { bootstrapRdsAdmin } from '@/lib/db/seed-rds-baseline';
import { verifyPassword } from '@/lib/password';
import {
  getConfiguredAdminEmail,
  getConfiguredAdminPassword,
  isAllowlistedAdminEmail,
} from '@/lib/admin-defaults';
import {
  adminAuthEmail,
  studentAuthEmail,
  validatePassword,
  validateRollNumber,
} from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';

export type AppRole = 'admin' | 'student';

async function tryBootstrapAdminFromEnv(email: string, password: string) {
  if (!isAllowlistedAdminEmail(email)) return;
  if (password !== getConfiguredAdminPassword()) return;
  if (adminAuthEmail(email) !== adminAuthEmail(getConfiguredAdminEmail())) return;

  await bootstrapRdsAdmin();
}

export function buildAuthProviders(): Provider[] {
  return [
    Credentials({
      id: 'student',
      name: 'Student',
      credentials: {
        rollNumber: { label: 'Roll number', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await ensureSchemaForAuth();
        const roll = normalizeRoll(String(credentials?.rollNumber ?? ''));
        const password = String(credentials?.password ?? '');
        const rollErr = validateRollNumber(roll);
        const passErr = validatePassword(password);
        if (rollErr || passErr) return null;

        const email = studentAuthEmail(roll);
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ rollNumber: roll }, { rollNumber: roll.replace(/\s+/g, '') }, { email }],
          },
          include: { adminUser: true },
        });

        if (!user?.passwordHash || user.adminUser) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName ?? roll,
          role: 'student' as const,
        };
      },
    }),
    Credentials({
      id: 'admin',
      name: 'Admin',
      credentials: {
        username: { label: 'Username or email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await ensureSchemaForAuth();
        const username = String(credentials?.username ?? '').trim();
        const password = String(credentials?.password ?? '');
        if (!username || validatePassword(password)) return null;

        const email = adminAuthEmail(username);
        let user = await prisma.user.findUnique({
          where: { email },
          include: { adminUser: true },
        });

        if (!user?.passwordHash || !user.adminUser) {
          await tryBootstrapAdminFromEnv(email, password);
          user = await prisma.user.findUnique({
            where: { email },
            include: { adminUser: true },
          });
        }

        if (!user?.passwordHash || !user.adminUser) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName ?? username,
          role: 'admin' as const,
        };
      },
    }),
  ];
}
