'use server';

import { redirect } from 'next/navigation';
import {
  runStudentCredentialSignIn,
  type StudentSignInInput,
} from '@/lib/auth/student-sign-in-core';

export type { StudentSignInInput } from '@/lib/auth/student-sign-in-core';

export type StudentSignInActionResult = { error?: string };

/** Login form — session cookie is set in this server request, then redirect. */
export async function studentSignInServer(
  input: StudentSignInInput & { redirectTo?: string },
): Promise<StudentSignInActionResult> {
  const result = await runStudentCredentialSignIn(input);
  if ('error' in result) {
    return { error: result.error };
  }

  const redirectTo =
    input.redirectTo?.startsWith('/') && !input.redirectTo.startsWith('//')
      ? input.redirectTo
      : '/exams';

  redirect(redirectTo);
}
