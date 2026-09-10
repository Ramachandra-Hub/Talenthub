'use client';

import { usePathname, useRouter } from 'next/navigation';
import { isExamFocusRoute } from '@/lib/exam-routes';

export default function GlobalBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (!pathname || pathname === '/' || pathname === '/exams' || isExamFocusRoute(pathname)) {
    return null;
  }

  if (pathname.startsWith('/admin')) {
    return null;
  }

  if (
    pathname === '/dsa' ||
    pathname.startsWith('/dsa/') ||
    pathname.startsWith('/dev/') ||
    pathname === '/home' ||
    pathname.startsWith('/exams') ||
    pathname.startsWith('/learning') ||
    pathname.startsWith('/contests') ||
    pathname.startsWith('/leaderboard') ||
    pathname.startsWith('/achievements') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/open-coding')
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[120] inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-4 py-2.5 text-sm font-semibold text-[#0c2340] shadow-[var(--shadow-lux)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[#1e3a5f]/25 hover:shadow-[var(--shadow-lux-lg)]"
      aria-label="Go back"
    >
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] text-xs">
        ←
      </span>
      <span>Back</span>
    </button>
  );
}
