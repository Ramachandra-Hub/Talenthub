'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getClientUser } from '@/lib/client-auth';

/** Keeps the one-login-per-roll lock alive while the student is using the app (including during exams). */
export function StudentSessionHeartbeat() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (pathname?.startsWith('/auth')) {
      setActive(false);
      return undefined;
    }

    let cancelled = false;

    const sync = async () => {
      const user = await getClientUser();
      if (cancelled) return;
      setActive(user?.role === 'student' || Boolean(user?.email));
    };

    void sync();
    const interval = window.setInterval(() => void sync(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    if (!active) return undefined;

    const ping = () => {
      void fetch('/api/auth/student/session-heartbeat', {
        method: 'POST',
        credentials: 'include',
      });
    };

    const onExamRoute =
      pathname?.startsWith('/placement') ||
      pathname?.startsWith('/tests/take') ||
      pathname?.startsWith('/exam/');
    const intervalMs = onExamRoute ? 30 * 1000 : 5 * 60 * 1000;

    ping();
    const timer = setInterval(ping, intervalMs);
    return () => clearInterval(timer);
  }, [active, pathname]);

  return null;
}
