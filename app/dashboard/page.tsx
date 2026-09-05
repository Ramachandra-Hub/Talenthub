'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getClientUser } from '@/lib/client-auth';

/** Student dashboard removed — route students to live examinations only. */
export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      const meRes = await fetch('/api/admin/me', { credentials: 'include' });
      if (meRes.ok) {
        const me = (await meRes.json()) as { isAdmin?: boolean };
        if (me.isAdmin) {
          router.replace('/admin/dashboard');
          return;
        }
      }
      router.replace('/home');
    };
    void run();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-600">Opening student portal…</p>
    </div>
  );
}
