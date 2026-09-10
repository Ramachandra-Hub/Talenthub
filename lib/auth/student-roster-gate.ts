import { prisma } from '@/lib/prisma';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { DEFAULT_EXAM_STUDENT_PASSWORD } from '@/lib/roster-credentials-export';
import { studentAuthEmail, validatePassword } from '@/lib/college-auth';
import { hashPassword } from '@/lib/password';
import { COLLEGE } from '@/lib/college-brand';

/** Shared sample password for IV Year self-login (and roster defaults). */
export function sampleStudentPassword(): string {
  return (
    process.env.EXAM_STUDENT_DEFAULT_PASSWORD?.trim() ||
    DEFAULT_EXAM_STUDENT_PASSWORD
  );
}

export function isSampleStudentPassword(password: string): boolean {
  return password.trim() === sampleStudentPassword();
}

function rollVariants(roll: string): string[] {
  const n = normalizeRoll(roll);
  return Array.from(new Set([n, roll.trim(), roll.trim().toUpperCase()].filter(Boolean)));
}

export type RosterHit = {
  rollNumber: string;
  studentName: string | null;
  department: string | null;
  year: string | null;
  password: string | null;
};

/** True when this roll appears on any exam / slot roster. */
export async function findExamRosterHit(rollNumber: string): Promise<RosterHit | null> {
  const variants = rollVariants(rollNumber);
  if (!variants.length) return null;

  const slot = await prisma.examSlotRosterEntry.findFirst({
    where: { rollNumber: { in: variants } },
    orderBy: { createdAt: 'desc' },
    select: {
      rollNumber: true,
      studentName: true,
      department: true,
      year: true,
      password: true,
    },
  });
  if (slot) {
    return {
      rollNumber: slot.rollNumber,
      studentName: slot.studentName,
      department: slot.department,
      year: slot.year,
      password: slot.password,
    };
  }

  const roster = await prisma.examStudentRoster.findFirst({
    where: { rollNumber: { in: variants } },
    orderBy: { createdAt: 'desc' },
    select: {
      rollNumber: true,
      fullName: true,
      branch: true,
      year: true,
    },
  });
  if (roster) {
    return {
      rollNumber: roster.rollNumber,
      studentName: roster.fullName,
      department: roster.branch,
      year: roster.year,
      password: null,
    };
  }

  return null;
}

export async function isRollOnExamRoster(rollNumber: string): Promise<boolean> {
  return Boolean(await findExamRosterHit(rollNumber));
}

/**
 * Non-IV students may only sign in when their roll is on an exam roster.
 * Creates the auth account on first login if the password matches the roster / sample default.
 */
export async function ensureRosterStudentAccount(input: {
  rollNumber: string;
  password: string;
  department: string;
  year: string;
}): Promise<{ error?: string }> {
  const hit = await findExamRosterHit(input.rollNumber);
  if (!hit) {
    return {
      error:
        'Your roll number is not on the exam roster. Only IV Year (4th year) students can sign in with the sample password without a roster entry. Ask faculty to add you to the roster.',
    };
  }

  const expectedPassword = hit.password?.trim() || sampleStudentPassword();
  const email = studentAuthEmail(input.rollNumber);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { rollNumber: input.rollNumber },
        { rollNumber: input.rollNumber.replace(/\s+/g, '') },
        { email },
      ],
    },
    include: { adminUser: true },
  });

  if (existing?.adminUser) {
    return { error: 'This account cannot sign in as a student.' };
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        branch: input.department || hit.department || existing.branch || undefined,
        academicYear: input.year || hit.year || existing.academicYear || undefined,
        college: COLLEGE.shortName,
        userRole: 'student',
        fullName: existing.fullName || hit.studentName || existing.fullName,
      },
    });
    return {};
  }

  // First login for a rostered student — password must match roster credentials.
  if (input.password.trim() !== expectedPassword) {
    return {
      error:
        'Incorrect roster password. Use the password issued with your exam roster (not a personal password until your account exists).',
    };
  }

  const passErr = validatePassword(input.password);
  if (passErr) return { error: passErr };

  const passwordHash = await hashPassword(input.password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      rollNumber: normalizeRoll(input.rollNumber),
      fullName: hit.studentName?.trim() || input.rollNumber,
      branch: input.department || hit.department || null,
      academicYear: input.year || hit.year || null,
      college: COLLEGE.shortName,
      userRole: 'student',
      subscriptionStatus: 'free',
    },
  });

  return {};
}
