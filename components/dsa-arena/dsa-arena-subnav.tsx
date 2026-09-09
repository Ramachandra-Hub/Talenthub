'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dsa-arena', label: 'Home', match: (p: string) => p === '/dsa-arena' },
  {
    href: '/dsa-arena/roadmap',
    label: 'Roadmap',
    match: (p: string) => p.startsWith('/dsa-arena/roadmap'),
  },
  {
    href: '/dsa-arena/contest',
    label: 'Contests',
    match: (p: string) =>
      p === '/dsa-arena/contest' ||
      p.startsWith('/dsa-arena/contest/') ||
      p.startsWith('/dsa-arena/contests'),
  },
] as const;

export function DsaArenaSubnav() {
  const pathname = usePathname() || '';
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="DSA Arena sections">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-[12px] font-semibold transition',
              active
                ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40'
                : 'bg-white/[0.04] text-slate-400 hover:text-slate-200',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
