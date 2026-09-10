import { signIn } from '@/auth';
import { studentAuthEmail, validatePassword, validateRollNumber } from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { ensureSchemaForAuth } from '@/lib/db/ensure-schema-for-auth';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { getAuthSetupErrors } from '@/lib/auth/config-check';
import { prisma } from '@/lib/prisma';
import { createStudentSessionId } from '@/lib/student-session-cookie';
import { hashPassword } from '@/lib/password';
import { COLLEGE } from '@/lib/college-brand';
import { isFourthYearForDsa } from '@/lib/dsa/roster';

export { copyAuthSessionCookiesToResponse } from '@/lib/auth/copy-auth-session-cookies';

export type StudentSignInInput = {
  rollNumber: string;
  password: string;
  department?: string;
  year?: string;
  /** Set after open-link join already authenticated the student. */
  openJoinProof?: string;
  /** Open-link exams: take over any stale device lock for this roll. */
  forceClaimSession?: boolean;
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
  const openJoinProof = input.openJoinProof?.trim() ?? '';

  if (!rollNumber) {
    return { error: 'Roll number is required.' };
  }
  if (!password && !openJoinProof) {
    return { error: 'Roll number and password are required.' };
  }

  const rollErr = validateRollNumber(rollNumber);
  if (rollErr) return { error: rollErr };

  const isIvYear = isFourthYearForDsa(year);

  if (isIvYear && !openJoinProof) {
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
      password: password || 'open-join',
      openJoinProof: openJoinProof || undefined,
      redirect: false,
    });
  } catch (err) {
    console.error('[student signin] signIn failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    const isCredentials =
      (err as { type?: string; code?: string } | null)?.type === 'CredentialsSignin' ||
      (err as { code?: string } | null)?.code === 'credentials' ||
      /credentialssignin/i.test(message);
    if (isCredentials) {
      if (openJoinProof) {
        return { error: 'Could not start the open-link exam session. Try joining again.' };
      }
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
    if (message.includes('schema') || message.includes('Database tables')) {
      return { error: message };
    }
    return { error: 'Sign-in failed. Check server logs or database connectivity.' };
  }

  if (result?.error) {
    if (openJoinProof) {
      return { error: 'Could not start the open-link exam session. Try joining again.' };
    }
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
  // Password already verified — always take over any prior lock for this roll.
  // Blocking re-login after a closed tab / cleared cookies caused false 401s.
  const { forceClaimStudentSessionPrisma } = await import('@/lib/student-session-lock-prisma');
  const lock = await forceClaimStudentSessionPrisma(rollNumber, user.id, sessionId);
  if (!lock.lockActive) {
    return {
      error:
        'Could not start your session. Wait a moment and try signing in again.',
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
