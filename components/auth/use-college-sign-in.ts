'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

type SignInOptions = {
  email: string;
  password: string;
  redirectTo?: string;
  metadata?: Record<string, string>;
};

export function useCollegeSignIn() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async ({ email, password, redirectTo = '/home', metadata }: SignInOptions) => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch('/api/auth/student/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            rollNumber: email,
            password,
            department: metadata?.department,
            year: metadata?.year,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? 'Sign in failed');
        }

        window.location.assign(redirectTo);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sign in failed';
        setError(
          /invalid login credentials/i.test(msg)
            ? 'Invalid roll number or password.'
            : msg,
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  return { signIn, loading, error, setError };
}
