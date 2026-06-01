'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { readJsonResponse } from '@/lib/fetch-json';

/** Redirects non-admins away from /admin pages. */
export function useAdminGate() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/me', { cache: 'no-store' });
        const { json } = await readJsonResponse<{
          isAdmin?: boolean;
          authenticated?: boolean;
          error?: string;
          hint?: string;
        }>(res);
        if (!json.isAdmin) {
          if (json.hint && !json.authenticated) {
            console.error('[admin gate]', json.error ?? json.hint);
          }
          router.replace(json.authenticated ? '/dashboard' : '/auth/login/admin');
          return;
        }
        setAllowed(true);
        setLoading(false);
      } catch (err) {
        console.error('[admin gate]', err);
        router.replace('/auth/login/admin');
      }
    };
    void run();
  }, [router]);

  return { allowed, loading };
}
