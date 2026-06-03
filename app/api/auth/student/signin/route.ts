import { NextRequest, NextResponse } from 'next/server';
import {
  copyAuthSessionCookiesToResponse,
  runStudentCredentialSignIn,
} from '@/lib/auth/student-sign-in-core';

export async function POST(request: NextRequest) {
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

  try {
    const result = await runStudentCredentialSignIn({
      rollNumber: body.rollNumber ?? '',
      password: body.password ?? '',
      department: body.department,
      year: body.year,
    });

    if (result.error) {
      const status = result.error.includes('not configured') ||
        result.error.includes('Database') ||
        result.error.includes('schema')
        ? 503
        : 401;
      return NextResponse.json({ error: result.error }, { status });
    }

    const res = NextResponse.json({
      success: true,
      userId: result.userId,
      email: result.email,
    });
    return copyAuthSessionCookiesToResponse(res);
  } catch (err) {
    console.error('[student signin]', err);
    const message = err instanceof Error ? err.message : 'Sign in failed';
    const status =
      message.includes('schema') || message.includes('Database') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
