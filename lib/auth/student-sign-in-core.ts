import { signIn } from '@/auth';
import { studentAuthEmail, validatePassword, validateRollNumber } from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { ensureSchemaForAuth } from '@/lib/db/ensure-schema-for-auth';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { getAuthSetupErrors } from '@/lib/auth/config-check';
import { prisma } from '@/lib/prisma';
import { claimStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
import { createStudentSessionId } from '@/lib/student-session-cookie';
import { cookies } from 'next/headers';
import { hashPassword } from '@/lib/password';
import { COLLEGE } from '@/lib/college-brand';
import { isFourthYearForDsa } from '@/lib/dsa/roster';

export type StudentSignInInput = {
  rollNumber: string;
  password: string;
  department?: string;
  year?: string;
};

export type StudentSignInResult =
  | { error: string }
  | { userId: string; email: string; sessionId: string };

/**
 * IV Year (4th year) students may self-provision on first login.
 * No admin DSA roster upload is required for them.
 */
async function ensureIvYearStudentAccount(input: {
  rollNumber: string;
  password: string;
  department: string;
  year: string;
}): Promise<{ error?: string }> {
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
        branch: input.department || existing.branch || undefined,
        academicYear: input.year || existing.academicYear || undefined,
        college: COLLEGE.shortName,
        userRole: 'student',
      },
    });
    return {};
  }

  const passErr = validatePassword(input.password);
  if (passErr) return { error: passErr };

  const passwordHash = await hashPassword(input.password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      rollNumber: input.rollNumber.replace(/\s+/g, ''),
      fullName: input.rollNumber,
      branch: input.department || null,
      academicYear: input.year,
      college: COLLEGE.shortName,
      userRole: 'student',
      subscriptionStatus: 'free',
    },
  });

  return {};
}

export async function runStudentCredentialSignIn(
  input: StudentSignInInput,
): Promise<StudentSignInResult> {
  const setupErrors = getAuthSetupErrors();
  if (setupErrors.length) {
    return { error: `Login is not configured: ${setupErrors.join(' ')}` };
  }

  try {
    await ensureSchemaForAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    return { error: remediation[0] ?? message };
  }

  const rollNumber = normalizeRoll(input.rollNumber);
  const password = input.password ?? '';
  const department = input.department?.trim() ?? '';
  const year = input.year?.trim() ?? '';

  if (!rollNumber || !password) {
    return { error: 'Roll number and password are required.' };
  }

  const rollErr = validateRollNumber(rollNumber);
  if (rollErr) return { error: rollErr };

  const isIvYear = isFourthYearForDsa(year);

  if (isIvYear) {
    try {
      const provisioned = await ensureIvYearStudentAccount({
        rollNumber,
        password,
        department,
        year,
      });
      if (provisioned.error) return { error: provisioned.error };
    } catch (err) {
      console.error('[student signin] IV Year provision failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(message)) {
        // Race: account created between lookup and insert — continue to sign-in.
      } else {
        const { remediation } = classifyDatabaseError(message);
        return { error: remediation[0] ?? 'Could not create student account.' };
      }
    }
  }

  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn('student', {
      rollNumber,
      password,
      redirect: false,
    });
  } catch (err) {
    console.error('[student signin] signIn failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('schema') || message.includes('Database tables')) {
      return { error: message };
    }
    return { error: 'Sign-in failed. Check server logs or database connectivity.' };
  }

  if (result?.error) {
    if (isIvYear) {
      return {
        error:
          'Invalid password for this roll number. If you just registered, use the same password you set.',
      };
    }
    return {
      error:
        'Invalid roll number or password. IV Year students: select IV Year to create your account on first login.',
    };
  }

  const email = studentAuthEmail(rollNumber);
  let user;
  try {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { rollNumber },
          { rollNumber: rollNumber.replace(/\s+/g, '') },
          { email },
        ],
      },
    });
  } catch (err) {
    console.error('[student signin] user lookup failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    return { error: remediation[0] ?? 'Database connection failed.' };
  }

  if (!user) {
    return {
      error: isIvYear
        ? 'Could not create your IV Year account. Try again.'
        : 'Account not found. Select IV Year on login to self-register, or ask faculty to provision your roll.',
    };
  }

  const sessionId = createStudentSessionId();
  const lock = await claimStudentSessionPrisma(rollNumber, user.id, sessionId);
  if (!lock.lockActive) {
    return {
      error:
        'This roll number already has an active login session. Please sign out from the other device first.',
    };
  }

  if (department || year) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        branch: department || undefined,
        academicYear: year || undefined,
        college: COLLEGE.shortName,
        userRole: 'student',
      },
    });
  }

  return { userId: user.id, email: user.email, sessionId };
}

/** Attach NextAuth session cookies to a Route Handler JSON response. */
export async function copyAuthSessionCookiesToResponse(
  response: Response,
  studentSessionId?: string,
): Promise<Response> {
  const jar = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  const headers = new Headers(response.headers);
  for (const c of jar.getAll()) {
    if (!c.name.includes('authjs') && !c.name.includes('next-auth')) continue;
    headers.append(
      'Set-Cookie',
      `${c.name}=${encodeURIComponent(c.value)}; Path=/; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`,
    );
  }
  if (studentSessionId) {
    const { studentSessionCookieHeader } = await import('@/lib/student-session-cookie');
    headers.append('Set-Cookie', studentSessionCookieHeader(studentSessionId));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
