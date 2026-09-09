'use client';

import Link from 'next/link';
import { Flame, Coins, Trophy, ArrowRight, Zap, Swords, ClipboardList } from 'lucide-react';
import type { PortalGamification } from '@/components/student/portal/portal-nav';
import { cn } from '@/lib/utils';

export function PortalHudCard({
  gamification,
  studentName,
}: {
  gamification: PortalGamification;
  studentName: string;
}) {
  const first = studentName.split(/\s+/)[0] || 'Student';
  const pct = Math.min(100, Math.round((gamification.xp / gamification.xpToNext) * 100));

  return (
    <div className="space-y-3.5">
      <div className="ex-panel rounded-lg p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-indigo-700 text-sm font-bold text-white shadow-[0_0_16px_rgba(34,211,238,0.35)]">
            {first.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/90">
              Level {gamification.level}
            </p>
            <p className="text-[14px] font-semibold leading-tight text-white">{studentName}</p>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Progress</p>
          <p className="text-[11px] font-semibold tabular-nums text-slate-200">
            {gamification.xp} / {gamification.xpToNext} XP
          </p>
        </div>
        <div className="ex-progress mt-2">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Flame, label: 'Day Streak', value: gamification.streak, ring: 'border-orange-400/30 bg-orange-500/10 text-orange-300' },
          { icon: Coins, label: 'Coins', value: gamification.coins, ring: 'border-amber-400/30 bg-amber-500/10 text-amber-300' },
          { icon: Trophy, label: 'Badges', value: gamification.badges, ring: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300' },
        ].map((stat) => (
          <div key={stat.label} className={cn('rounded-md border px-1.5 py-2.5 text-center', stat.ring)}>
            <stat.icon className="mx-auto h-3.5 w-3.5" />
            <p className="mt-1.5 text-[13px] font-bold tabular-nums text-white">{stat.value}</p>
            <p className="text-[9px] leading-tight text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortalQuestCard({
  title,
  progress,
  total,
  xp,
  coins,
}: {
  title: string;
  progress: number;
  total: number;
  xp: number;
  coins: number;
}) {
  const pct = total ? Math.round((progress / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.12] via-[#0a1424]/90 to-[#0a1424] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/90">Today&apos;s Quest</p>
        <Zap className="h-3.5 w-3.5 text-amber-300" />
      </div>
      <p className="mt-2 text-[13px] font-semibold text-white">{title}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>
          {progress} / {total}
        </span>
        <span className="font-semibold text-amber-200/85">
          +{xp} XP · +{coins} Coins
        </span>
      </div>
      <div className="ex-progress mt-2">
        <span style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#fbbf24,#f59e0b)' }} />
      </div>
    </div>
  );
}

export function PortalQuickLinks() {
  return (
    <div className="grid gap-2">
      <Link href="/dsa-arena" className="ex-btn-primary w-full justify-between">
        <span className="inline-flex items-center gap-2">
          <Swords className="h-3.5 w-3.5" /> Enter DSA Arena
        </span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <Link href="/exams" className="ex-btn-ghost w-full justify-between">
        <span className="inline-flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5" /> Open Exam Center
        </span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
