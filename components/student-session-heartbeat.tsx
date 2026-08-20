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

    const onExamRoute =
      pathname === '/placement/take' ||
      pathname?.startsWith('/tests/take') ||
      pathname?.startsWith('/exam/');
    if (onExamRoute) {
      setActive(true);
      return undefined;
    }

    let cancelled = false;

    const sync = async () => {
      const user = await getClientUser();
      if (cancelled) return;
      setActive(user?.role === 'student' || Boolean(user?.email));
    };

    void sync();
    const interval = window.setInterval(() => void sync(), 5 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    if (!active) return undefined;

    const ping = () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      void fetch('/api/student/session-heartbeat', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
        .catch(() => {
          /* ignore when the server is restarting or offline */
        })
        .finally(() => window.clearTimeout(timer));
    };

    const onExamRoute =
      pathname === '/placement/take' ||
      pathname?.startsWith('/tests/take') ||
      pathname?.startsWith('/exam/');
    const intervalMs = onExamRoute ? 30 * 1000 : 5 * 60 * 1000;

    ping();
    const timer = setInterval(ping, intervalMs);
    return () => clearInterval(timer);
  }, [active, pathname]);

  return null;
}
