import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { studentAuthEmail } from '@/lib/college-auth';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { claimStudentSessionPrisma, nextAuthSessionId } from '@/lib/student-session-lock-prisma';
import { autoEnsureRdsSchema } from '@/lib/db/auto-ensure-rds';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  await autoEnsureRdsSchema();

  let body: {
    rollNumber?: string;
    password?: string;
    department?: string;
    year?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rollNumber = normalizeRoll(body.rollNumber ?? '');
  const password = body.password ?? '';
  const department = body.department?.trim() ?? '';
  const year = body.year?.trim() ?? '';

  if (!rollNumber || !password) {
    return NextResponse.json({ error: 'Roll number and password are required' }, { status: 400 });
  }

  const result = await signIn('student', {
    rollNumber,
    password,
    redirect: false,
  });

  if (result?.error) {
    return NextResponse.json(
      {
        error: 'Invalid roll number or password.',
      },
      { status: 401 },
    );
  }

  const email = studentAuthEmail(rollNumber);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ rollNumber: rollNumber.replace(/\s+/g, '') }, { email }],
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 401 });
  }

  const sessionId = nextAuthSessionId(user.id);
  await claimStudentSessionPrisma(rollNumber, user.id, sessionId);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: rollNumber,
      branch: department || undefined,
      academicYear: year || undefined,
    },
  });

  return NextResponse.json({
    success: true,
    email: user.email,
    userId: user.id,
  });
}
