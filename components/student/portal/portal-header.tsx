'use client';

import { Bell, ChevronDown, Menu, Search } from 'lucide-react';

type Props = {
  title: string;
  subtitle?: string;
  studentName: string;
  level: number;
  onMenu?: () => void;
  showSearch?: boolean;
};

export function PortalHeader({
  title,
  subtitle,
  studentName,
  level,
  onMenu,
  showSearch = true,
}: Props) {
  const first = studentName.split(/\s+/)[0] || 'Student';

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#050b14]/78 px-3 py-3.5 backdrop-blur-xl sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="lg:hidden rounded-md border border-white/10 p-2 text-slate-300 transition-colors duration-200 hover:bg-white/5"
          onClick={onMenu}
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-bold tracking-[0.03em] text-white sm:text-[24px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[12px] text-slate-400 sm:text-[13px]">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="flex max-w-xl flex-1 items-center justify-end gap-2 sm:gap-3">
        {showSearch ? (
          <label className="relative hidden max-w-[280px] flex-1 md:block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              placeholder="Search topics, missions, or anything..."
              className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-[12px] text-slate-200 outline-none transition-[border,box-shadow] duration-200 placeholder:text-slate-500 focus:border-cyan-500/40 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.12)]"
            />
          </label>
        ) : null}
        <button
          type="button"
          className="rounded-md border border-white/10 p-2 text-slate-300 transition-colors duration-200 hover:bg-white/5"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-2.5 text-left transition-colors duration-200 hover:bg-white/[0.07]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-indigo-700 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(34,211,238,0.3)]">
            {first.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden sm:block">
            <span className="block text-[12px] font-semibold leading-tight text-white">{first}</span>
            <span className="block text-[10px] text-cyan-300/85">Level {level}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-slate-500 sm:block" />
        </button>
      </div>
    </header>
  );
}
