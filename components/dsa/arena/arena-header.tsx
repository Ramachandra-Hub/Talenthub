'use client';

import { Bell, ChevronDown, Menu, Search } from 'lucide-react';

type Props = {
  studentName: string;
  level: number;
  onMenu?: () => void;
};

export function ArenaHeader({ studentName, level, onMenu }: Props) {
  const first = studentName.split(/\s+/)[0] || 'Student';

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 bg-[#070d18]/40 px-4 py-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="lg:hidden rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"
          onClick={onMenu}
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">DSA ARENA</h1>
          <p className="text-xs text-slate-400 sm:text-sm">Turn your coding skills into superpowers</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 max-w-xl">
        <label className="relative hidden md:block flex-1 max-w-xs">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            placeholder="Search topics, missions, or anything..."
            className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/30"
          />
        </label>
        <button
          type="button"
          className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/5"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-3 text-left hover:bg-white/10"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 text-xs font-bold text-white">
            {first.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden sm:block">
            <span className="block text-xs font-semibold text-white">{first}</span>
            <span className="block text-[10px] text-cyan-300/80">Level {level}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-slate-500 sm:block" />
        </button>
      </div>
    </header>
  );
}
