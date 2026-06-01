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
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const res = NextResponse.json({
      success: true,
      userId: result.userId,
      email: result.email,
    });
    return copyAuthSessionCookiesToResponse(res);
  } catch (err) {
    console.error('[student signin]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sign in failed' },
      { status: 500 },
    );
  }
}
