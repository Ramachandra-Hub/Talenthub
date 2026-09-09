'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { PORTAL_NAV } from '@/components/student/portal/portal-nav';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  subtitle?: string;
  studentName: string;
  children: ReactNode;
};

/**
 * Lightweight Arena chrome — avoids hard dependency on PortalShell so
 * /dsa-arena keeps working even when portal package files diverge across clones.
 */
export function DsaArenaShell({ title, subtitle, studentName, children }: Props) {
  const pathname = usePathname() || '/dsa-arena';
  const [open, setOpen] = useState(false);
  const first = studentName.split(/\s+/)[0] || 'Student';

  return (
    <div className="ex-portal">
      <div className="ex-portal-mist" aria-hidden />
      <div className="relative z-[1]">
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] lg:hidden transition-opacity duration-200',
            open ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <aside
          className={cn(
            'fixed left-0 top-0 z-50 flex h-[100dvh] w-[196px] flex-col border-r border-cyan-500/15 bg-[#050b14]/94 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <div className="px-4 pt-7 pb-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/30 bg-gradient-to-br from-cyan-500/30 to-indigo-700/40 text-[11px] font-black text-cyan-100">
                EX
              </span>
              <div>
                <p className="text-[12px] font-bold tracking-[0.22em] text-white">ELEVATE-X</p>
                <p className="mt-0.5 text-[10px] text-slate-400">DSA Arena</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-2">
            {PORTAL_NAV.map((item) => {
              const active = item.isActive(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-[12px] font-semibold transition',
                    active
                      ? 'bg-cyan-500/15 text-cyan-100'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="lg:pl-[196px]">
          <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#050b14]/78 px-3 py-3.5 backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="lg:hidden rounded-md border border-white/10 p-2 text-slate-300"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-bold text-white sm:text-[24px]">{title}</h1>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-[12px] text-slate-400">{subtitle}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="lg:hidden rounded-md border border-white/10 p-2 text-slate-400"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-[12px] font-semibold text-slate-300">{first}</p>
            </div>
          </header>
          <div className="mx-auto max-w-[1680px] px-3 py-4 sm:px-5 xl:px-6">
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
