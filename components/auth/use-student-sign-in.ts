'use client';

import { useCallback, useState } from 'react';
import { studentSignInAction } from '@/lib/auth/student-sign-in-server';

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
        const result = await studentSignInAction({
          rollNumber: rollNumber.trim(),
          password,
          department,
          year,
          redirectTo,
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        if (!result.ok) {
          setError('Sign in failed. Try again.');
          return;
        }

        const dest =
          redirectTo.startsWith('/') && !redirectTo.startsWith('//')
            ? redirectTo
            : '/exams';

        window.location.assign(dest);
      } catch (err) {
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
