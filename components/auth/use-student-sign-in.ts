'use client';

import { useCallback, useState } from 'react';
import { studentSignInServer } from '@/lib/auth/student-sign-in-server';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

type StudentSignInOptions = {
  rollNumber: string;
  password: string;
  department?: string;
  year?: string;
  redirectTo?: string;
};

export function useStudentSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async ({
      rollNumber,
      password,
      department,
      year,
      redirectTo = '/exams',
    }: StudentSignInOptions) => {
      setError(null);
      setLoading(true);
      try {
        const result = await studentSignInServer({
          rollNumber: rollNumber.trim(),
          password,
          department,
          year,
          redirectTo,
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
      } catch (err) {
        if (isRedirectError(err)) {
          throw err;
        }
        const msg = err instanceof Error ? err.message : 'Sign in failed';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { signIn, loading, error, setError };
}
