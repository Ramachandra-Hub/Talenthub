'use client';

import { useCallback, useState } from 'react';

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
      redirectTo = '/home',
    }: StudentSignInOptions) => {
      setError(null);
      setLoading(true);
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 25_000);
        let res: Response;
        try {
          res = await fetch('/api/student/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
            body: JSON.stringify({
              rollNumber: rollNumber.trim(),
              password,
              department,
              year,
            }),
          });
        } finally {
          window.clearTimeout(timer);
        }

        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? 'Sign in failed. Try again.');
          return;
        }

        const dest =
          redirectTo.startsWith('/') && !redirectTo.startsWith('//')
            ? redirectTo
            : '/home';

        window.location.assign(dest);
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        const raw = err instanceof Error ? err.message : 'Sign in failed';
        const msg =
          aborted || raw === 'Failed to fetch' || /network|fetch|timeout/i.test(raw)
            ? 'Cannot reach the server. Refresh this page (Ctrl+F5) and try again.'
            : raw;
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { signIn, loading, error, setError };
}
