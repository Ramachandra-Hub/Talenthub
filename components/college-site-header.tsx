'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CollegeLogo } from '@/components/auth/college-logo';
import { COLLEGE } from '@/lib/college-brand';
import { isExamFocusRoute } from '@/lib/exam-routes';
import { defaultRedirectForRole, type AppRole } from '@/lib/roles';
import { getBrowserAuthUser } from '@/lib/client-auth';

function homeHrefForRole(role: AppRole | null): string {
  if (!role || role === 'guest') return '/';
  return defaultRedirectForRole(role);
}

/** Persistent RCE blue brand bar — visible on every page except active exam-taking. */
export default function CollegeSiteHeader() {
  const pathname = usePathname();
  const [homeHref, setHomeHref] = useState('/');

  useEffect(() => {
    const sync = async () => {
      const user = await getBrowserAuthUser();
      if (!user) {
        setHomeHref('/');
        return;
      }
      const metaRole = String(user.role ?? user.user_metadata?.role ?? '').toLowerCase();
      const role: AppRole = metaRole === 'admin' ? 'admin' : 'student';
      setHomeHref(homeHrefForRole(role));
    };

    void sync();
    const id = window.setInterval(() => void sync(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (isExamFocusRoute(pathname)) {
    return null;
  }

  const isPortalRoute =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/auth');

  return (
    <header className="app-brand-bar relative sticky top-0 z-[100]">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-4 sm:py-3">
        <div
          className="flex shrink-0 items-center gap-2.5 sm:gap-3 pointer-events-none select-none"
          aria-hidden
        >
          <span className="rounded-lg bg-white/95 p-0.5 shadow-sm ring-1 ring-white/30">
            <CollegeLogo size={isPortalRoute ? 36 : 40} className="sm:w-10 sm:h-10" />
          </span>
          <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-xs font-extrabold text-white ring-1 ring-white/25 backdrop-blur-sm">
            {COLLEGE.rce}
          </span>
        </div>

        <Link
          href={homeHref}
          className="min-w-0 flex-1 text-left transition-opacity hover:opacity-90"
        >
          <p className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-white leading-tight truncate font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
            {COLLEGE.name}
          </p>
          <p className="brand-subtitle mt-0.5 text-[11px] sm:text-xs font-medium leading-snug truncate tracking-wide">
            {COLLEGE.departmentTitle}
          </p>
        </Link>
      </div>
    </header>
  );
}
