import { signIn } from '@/auth';
import { studentAuthEmail } from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { autoEnsureRdsSchema } from '@/lib/db/auto-ensure-rds';
import { getAuthSetupErrors } from '@/lib/auth/config-check';
import { prisma } from '@/lib/prisma';
import { claimStudentSessionPrisma, nextAuthSessionId } from '@/lib/student-session-lock-prisma';
import { cookies } from 'next/headers';

export type StudentSignInInput = {
  rollNumber: string;
  password: string;
  department?: string;
  year?: string;
};

export type StudentSignInResult =
  | { error: string }
  | { userId: string; email: string };

export async function runStudentCredentialSignIn(
  input: StudentSignInInput,
): Promise<StudentSignInResult> {
  const setupErrors = getAuthSetupErrors();
  if (setupErrors.length) {
    return { error: `Login is not configured: ${setupErrors.join(' ')}` };
  }

  await autoEnsureRdsSchema();

  const rollNumber = normalizeRoll(input.rollNumber);
  const password = input.password ?? '';
  const department = input.department?.trim() ?? '';
  const year = input.year?.trim() ?? '';

  if (!rollNumber || !password) {
    return { error: 'Roll number and password are required.' };
  }

  const result = await signIn('student', {
    rollNumber,
    password,
    redirect: false,
  });

  if (result?.error) {
    return { error: 'Invalid roll number or password.' };
  }

  const email = studentAuthEmail(rollNumber);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { rollNumber },
        { rollNumber: rollNumber.replace(/\s+/g, '') },
        { email },
      ],
    },
  });

  if (!user) {
    return {
      error: 'Account not found. Ask faculty to provision your roll on the exam roster.',
    };
  }

  const sessionId = nextAuthSessionId(user.id);
  await claimStudentSessionPrisma(rollNumber, user.id, sessionId);

  if (department || year) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        branch: department || undefined,
        academicYear: year || undefined,
      },
    });
  }

  return { userId: user.id, email: user.email };
}

/** Attach NextAuth session cookies to a Route Handler JSON response. */
export async function copyAuthSessionCookiesToResponse(
  response: Response,
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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
