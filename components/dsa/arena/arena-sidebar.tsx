'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Swords,
  ClipboardList,
  BookOpen,
  Trophy,
  Medal,
  Award,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/dsa', label: 'DSA Arena', icon: Swords },
  { href: '/exams', label: 'Exam Center', icon: ClipboardList },
  { href: '/home', label: 'Learning Hub', icon: BookOpen },
  { href: '/dsa/history', label: 'Contests', icon: Trophy },
  { href: '/dsa/history', label: 'Leaderboard', icon: Medal },
  { href: '/dsa/history', label: 'Achievements', icon: Award },
  { href: '/home', label: 'Profile', icon: User },
];

type Props = {
  open?: boolean;
  onClose?: () => void;
};

export function ArenaSidebar({ open = false, onClose }: Props) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-[100dvh] w-[190px] flex-col border-r border-cyan-500/10 bg-[#070d18]/95 backdrop-blur-xl transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="px-4 pt-6 pb-5 border-b border-white/5">
          <p className="text-[11px] font-bold tracking-[0.28em] text-cyan-300">ELEVATE-X</p>
          <p className="mt-1 text-[10px] tracking-wide text-slate-400">Code. Play. Grow.</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5" aria-label="Arena navigation">
          {NAV.map((item) => {
            const isActive =
              item.label === 'DSA Arena'
                ? pathname === '/dsa' ||
                  (pathname.startsWith('/dsa/') &&
                    !pathname.startsWith('/dsa/history'))
                : item.label === 'Achievements' ||
                    item.label === 'Leaderboard' ||
                    item.label === 'Contests'
                  ? pathname.startsWith('/dsa/history')
                  : item.label === 'Exam Center'
                    ? pathname.startsWith('/exams')
                    : item.label === 'Home'
                      ? pathname === '/home'
                      : false;

            const Icon = item.icon;
            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12px] font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                )}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                ) : null}
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="m-3 overflow-hidden rounded-xl border border-cyan-500/15 bg-gradient-to-br from-[#0c1a2e] to-[#08101c] p-3">
          <div className="relative h-16 rounded-lg bg-[radial-gradient(ellipse_at_bottom,_#1e3a5f_0%,_#0a1525_70%)] overflow-hidden">
            <div className="absolute inset-x-0 bottom-0 h-8 bg-[linear-gradient(90deg,transparent,#334155,#64748b,#334155,transparent)] opacity-40" />
            <div className="absolute left-3 bottom-2 h-6 w-10 rounded-t-full bg-slate-600/50" />
            <div className="absolute right-4 bottom-3 h-8 w-6 rounded-sm bg-slate-500/40" />
          </div>
          <p className="mt-3 text-[11px] font-semibold leading-snug text-slate-200">
            Small Steps
            <br />
            <span className="text-cyan-300/90">Big Careers</span>
          </p>
        </div>
      </aside>
    </>
  );
}
