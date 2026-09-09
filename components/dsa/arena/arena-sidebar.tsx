'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PORTAL_NAV } from '@/components/student/portal/portal-nav';

type Props = {
  open?: boolean;
  onClose?: () => void;
};

export function ArenaSidebar({ open = false, onClose }: Props) {
  const pathname = usePathname() || '/dsa';

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] lg:hidden transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-[100dvh] w-[196px] flex-col border-r border-cyan-500/15 bg-[#050b14]/92 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="px-4 pt-7 pb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/30 bg-gradient-to-br from-cyan-500/30 to-indigo-700/40 text-[11px] font-black tracking-tight text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.25)]">
              EX
            </span>
            <div>
              <p className="text-[12px] font-bold tracking-[0.22em] text-white">ELEVATE-X</p>
              <p className="mt-0.5 text-[10px] tracking-wide text-slate-400">Code. Play. Grow.</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1" aria-label="Arena navigation">
          {PORTAL_NAV.map((item) => {
            const isActive = item.isActive(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[12px] font-medium transition-all duration-200',
                  isActive
                    ? 'bg-cyan-500/12 text-cyan-50 shadow-[inset_3px_0_0_0_#22d3ee,0_0_20px_rgba(34,211,238,0.08)]'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors duration-200',
                    isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300',
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="m-3 overflow-hidden rounded-lg border border-cyan-500/20 arena-panel p-0">
          <div
            className="relative h-[72px] bg-cover bg-center"
            style={{ backgroundImage: "url('/elevatex/arena-map-bg.png')" }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#050b14] via-[#050b14]/40 to-transparent" />
          </div>
          <div className="px-3 pb-3 pt-2">
            <p className="text-[11px] font-semibold leading-snug text-slate-200">
              Small Steps
              <br />
              <span className="text-cyan-300">Big Careers</span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
