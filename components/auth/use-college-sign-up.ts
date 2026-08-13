'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CollegeSignupRole } from '@/lib/college-signup';

type SignUpOptions = {
  email: string;
  password: string;
  fullName: string;
  role: CollegeSignupRole;
  redirectTo?: string;
  metadata?: Record<string, string>;
};

export function useCollegeSignUp() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = useCallback(
    async ({
      email,
      password,
      fullName,
      role,
      redirectTo = '/home',
      metadata = {},
    }: SignUpOptions) => {
      setError(null);
      setLoading(true);
      try {
        const signupRes = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            fullName,
            role,
            next: redirectTo,
            metadata: { role, ...metadata },
          }),
        });

        const signupJson = (await signupRes.json().catch(() => ({}))) as {
          error?: string;
          user_id?: string | null;
        };

        if (!signupRes.ok) {
          throw new Error(signupJson.error || 'Registration failed. Please try again.');
        }

        if (role === 'student') {
          const rollNumber =
            metadata.roll_number?.trim() || email.split('@')[0]?.trim() || '';
          const signinRes = await fetch('/api/student/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              rollNumber,
              password,
              department: metadata.department,
              year: metadata.year,
            }),
          });
          const signinJson = (await signinRes.json().catch(() => ({}))) as { error?: string };
          if (!signinRes.ok) {
            router.push('/auth/login/student');
            setError(signinJson.error ?? 'Account created. Sign in with your roll number.');
            return;
          }
        }

        router.push(redirectTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  return { signUp, loading, error, setError };
}
