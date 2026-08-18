import { signIn } from '@/auth';
import { studentAuthEmail } from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { ensureSchemaForAuth } from '@/lib/db/ensure-schema-for-auth';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { getAuthSetupErrors } from '@/lib/auth/config-check';
import { prisma } from '@/lib/prisma';
import { claimStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
import { createStudentSessionId } from '@/lib/student-session-cookie';
import { cookies } from 'next/headers';

export type StudentSignInInput = {
  rollNumber: string;
  password: string;
  department?: string;
  year?: string;
};

export type StudentSignInResult =
  | { error: string }
  | { userId: string; email: string; sessionId: string };

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
    return { error: 'Invalid roll number or password.' };
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
      error: 'Account not found. Ask faculty to provision your roll on the exam roster.',
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
