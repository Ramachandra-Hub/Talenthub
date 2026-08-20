'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { getBrowserAuthUser, signOutClient } from '@/lib/client-auth';
import { isExamFocusRoute } from '@/lib/exam-routes';

export default function AppSessionBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (pathname !== '/exams') {
      setEmail(null);
      return undefined;
    }

    const refresh = async () => {
      const user = await getBrowserAuthUser();
      setEmail(user?.email ?? null);
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [pathname]);

  if (!mounted) return null;
  if (email === undefined) return null;
  if (!email) return null;
  if (isExamFocusRoute(pathname)) return null;
  if (pathname === '/' || pathname?.startsWith('/auth')) return null;
  if (pathname !== '/exams') return null;

  const handleLogout = async () => {
    await signOutClient();
    setEmail(null);
    router.push('/');
    router.refresh();
  };

  const bar = (
    <div
      className="pointer-events-auto fixed top-[4.25rem] right-3 z-[9999] flex max-w-[min(100vw-1.5rem,22rem)] flex-wrap items-center justify-end gap-2 rounded-xl border border-[#1e3a5f]/20 border-t-2 border-t-[#1e3a5f] bg-white/95 px-3 py-2 text-xs shadow-[var(--shadow-lux)] backdrop-blur-md sm:right-4 sm:text-sm"
      role="region"
      aria-label="Account"
    >
      <span className="truncate font-medium text-slate-700" title={email}>
        {email}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-slate-300 text-slate-800 hover:bg-slate-50"
        onClick={() => void handleLogout()}
      >
        Log out
      </Button>
    </div>
  );

  return createPortal(bar, document.body);
}
