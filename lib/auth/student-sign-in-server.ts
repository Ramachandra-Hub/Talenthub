'use server';

import {
  runStudentCredentialSignIn,
  type StudentSignInInput,
} from '@/lib/auth/student-sign-in-core';

export type { StudentSignInInput } from '@/lib/auth/student-sign-in-core';

export type StudentSignInActionResult = { error?: string; ok?: true };

/**
 * Sets the NextAuth session cookie in this server request.
 * Client must call window.location.assign(redirectTo) afterward so the browser loads with the cookie.
 */
export async function studentSignInAction(
  input: StudentSignInInput & { redirectTo?: string },
): Promise<StudentSignInActionResult> {
  const result = await runStudentCredentialSignIn(input);
  if ('error' in result) {
    return { error: result.error };
  }
  return { ok: true };
}
