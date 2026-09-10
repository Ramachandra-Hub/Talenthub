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
  validateAdminPassword,
  validatePassword,
  validateRollNumber,
} from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';

export type AppRole = 'admin' | 'student';

async function tryBootstrapAdminFromEnv(email: string, password: string) {
  if (!isAllowlistedAdminEmail(email)) return;
  const configured = getConfiguredAdminPassword();
  if (!configured || password !== configured) return;
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
        openJoinProof: { label: 'Open join proof', type: 'text' },
        year: { label: 'Academic year', type: 'text' },
      },
      async authorize(credentials) {
        await ensureSchemaForAuth();
        const roll = normalizeRoll(String(credentials?.rollNumber ?? ''));
        const password = String(credentials?.password ?? '');
        const openJoinProof = String(credentials?.openJoinProof ?? '').trim();
        const year = String(credentials?.year ?? '').trim();
        const rollErr = validateRollNumber(roll);
        if (rollErr) return null;

        if (openJoinProof) {
          const { verifyOpenJoinProof } = await import('@/lib/exams/open-join-proof');
          const userId = verifyOpenJoinProof(openJoinProof);
          if (!userId) return null;
          const proven = await prisma.user.findUnique({
            where: { id: userId },
            include: { adminUser: true },
          });
          if (!proven?.passwordHash || proven.adminUser) return null;
          const provenRoll = normalizeRoll(proven.rollNumber ?? '');
          if (provenRoll && provenRoll !== roll) return null;
          return {
            id: proven.id,
            email: proven.email,
            name: proven.fullName ?? roll,
            role: 'student' as const,
          };
        }

        const passErr = validatePassword(password);
        if (passErr) return null;

        const email = studentAuthEmail(roll);
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ rollNumber: roll }, { rollNumber: roll.replace(/\s+/g, '') }, { email }],
          },
          include: { adminUser: true },
        });

        if (!user || user.adminUser) return null;

        const { isSampleStudentPassword } = await import('@/lib/auth/student-roster-gate');
        const { isFourthYearForDsa } = await import('@/lib/dsa/roster');
        const { hashPassword } = await import('@/lib/password');
        const ivSelected = isFourthYearForDsa(year) || isFourthYearForDsa(user.academicYear);
        const sampleOk = isSampleStudentPassword(password) && ivSelected;

        if (!user.passwordHash) {
          if (!sampleOk && !ivSelected) return null;
          // Create hash so subsequent logins work.
          const passwordHash = await hashPassword(password);
          await prisma.user.update({
            where: { id: user.id },
            data: {
              passwordHash,
              academicYear: year || user.academicYear || 'IV Year',
              userRole: 'student',
            },
          });
          return {
            id: user.id,
            email: user.email,
            name: user.fullName ?? roll,
            role: 'student' as const,
          };
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok && sampleOk) {
          // IV Year sample password always unlocks.
          await prisma.user.update({
            where: { id: user.id },
            data: {
              passwordHash: await hashPassword(password),
              academicYear: year || user.academicYear || 'IV Year',
            },
          });
        } else if (!ok) {
          return null;
        }

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
        if (!username || validateAdminPassword(password)) return null;

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
        let ok = await verifyPassword(password, user.passwordHash);
        const configuredPassword = getConfiguredAdminPassword();
        if (
          !ok &&
          configuredPassword &&
          password === configuredPassword &&
          isAllowlistedAdminEmail(email)
        ) {
          // Env password is correct but DB hash drifted — re-sync from PREPINDIA_ADMIN_*.
          await tryBootstrapAdminFromEnv(email, password);
          user = await prisma.user.findUnique({
            where: { email },
            include: { adminUser: true },
          });
          if (!user?.passwordHash || !user.adminUser) return null;
          ok = await verifyPassword(password, user.passwordHash);
        }
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
