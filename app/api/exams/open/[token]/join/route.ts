import { NextRequest, NextResponse } from 'next/server';
import { joinOpenExam } from '@/lib/exams/open-exam-link';
import {
  copyAuthSessionCookiesToResponse,
  runStudentCredentialSignIn,
} from '@/lib/auth/student-sign-in-core';
import { guardLoginAttempt } from '@/lib/auth/login-rate-limit';
import { DEFAULT_EXAM_STUDENT_PASSWORD } from '@/lib/roster-credentials-export';

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: Params) {
  const loginDenied = guardLoginAttempt(request, 'student');
  if (loginDenied) return loginDenied;

  const { token } = await context.params;
  let body: {
    rollNumber?: string;
    password?: string;
    branch?: string;
    year?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const idDenied = guardLoginAttempt(request, 'student', body.rollNumber);
  if (idDenied) return idDenied;

  try {
    const joined = await joinOpenExam({
      token,
      rollNumber: body.rollNumber ?? '',
      password: body.password ?? DEFAULT_EXAM_STUDENT_PASSWORD,
      branch: body.branch ?? '',
      year: body.year ?? '',
    });

    const signed = await runStudentCredentialSignIn({
      rollNumber: joined.rollNumber,
      password: body.password || DEFAULT_EXAM_STUDENT_PASSWORD,
      department: body.branch,
      year: body.year,
    });
    if ('error' in signed) {
      return NextResponse.json(
        {
          error: signed.error,
          takeUrl: joined.takeUrl,
        },
        { status: 401 },
      );
    }

    const json = NextResponse.json({
      ok: true,
      takeUrl: joined.takeUrl,
    });
    return copyAuthSessionCookiesToResponse(json, signed.sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not join exam';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
