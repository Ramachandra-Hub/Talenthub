'use client';

import Link from 'next/link';
import { Flame, Coins, Trophy, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArenaAchievement, ArenaDashboardModel } from '@/components/dsa/arena/arena-types';

function XpBar({ xp, xpToNext }: { xp: number; xpToNext: number }) {
  const pct = Math.min(100, Math.round((xp / xpToNext) * 100));
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AchievementRow({ item }: { item: ArenaAchievement }) {
  const tone =
    item.tone === 'green'
      ? 'from-emerald-500/30 to-emerald-900/20 border-emerald-400/30'
      : item.tone === 'blue'
        ? 'from-cyan-500/30 to-blue-900/20 border-cyan-400/30'
        : item.tone === 'orange'
          ? 'from-orange-500/30 to-amber-900/20 border-orange-400/30'
          : 'from-violet-500/30 to-purple-900/20 border-violet-400/30';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-gradient-to-r p-2.5',
        tone,
        !item.unlocked && 'opacity-40 grayscale',
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/30 text-xs font-bold text-white">
        {item.unlocked ? '✓' : '·'}
      </span>
      <div>
        <p className="text-xs font-semibold text-white">{item.title}</p>
        <p className="text-[10px] leading-snug text-slate-400">{item.description}</p>
      </div>
    </div>
  );
}

export function ArenaRightPanel({ model }: { model: ArenaDashboardModel }) {
  const first = model.studentName.split(/\s+/)[0] || 'Student';
  const questPct = Math.round((model.dailyQuest.progress / model.dailyQuest.total) * 100);

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/20 bg-[#0a1424]/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-700 text-sm font-bold text-white shadow-[0_0_16px_rgba(34,211,238,0.35)]">
            {first.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Level {model.level}</p>
            <p className="text-sm font-semibold text-white">{model.studentName}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
          {model.xp} / {model.xpToNext} XP
        </p>
        <XpBar xp={model.xp} xpToNext={model.xpToNext} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Flame, label: 'Day Streak', value: model.streak, color: 'text-orange-300' },
          { icon: Coins, label: 'Coins', value: model.coins, color: 'text-amber-300' },
          { icon: Trophy, label: 'Badges', value: model.badges, color: 'text-cyan-300' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center"
          >
            <stat.icon className={cn('mx-auto h-4 w-4', stat.color)} />
            <p className="mt-1.5 text-sm font-bold text-white">{stat.value}</p>
            <p className="text-[9px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a1424]/70 p-4">
        <p className="font-[family-name:var(--font-hub-display),Georgia,serif] text-sm italic leading-relaxed text-slate-200 whitespace-pre-line">
          {model.quote}
        </p>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-[#0a1424] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200/90">Today&apos;s Quest</p>
          <Zap className="h-3.5 w-3.5 text-amber-300" />
        </div>
        <p className="mt-2 text-sm font-semibold text-white">{model.dailyQuest.title}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {model.dailyQuest.progress} / {model.dailyQuest.total}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${questPct}%` }} />
        </div>
        <p className="mt-2 text-[11px] font-medium text-amber-200/80">
          +{model.dailyQuest.xpReward} XP · +{model.dailyQuest.coinsReward} Coins
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a1424]/70 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Weekly Progress</p>
        <p className="mt-2 text-sm font-semibold text-white">{model.currentWeekTitle}</p>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#22d3ee ${model.weekProgressPercent}%, rgba(255,255,255,0.08) 0)`,
            }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a1424] text-[11px] font-bold text-white">
              {model.weekProgressPercent}%
            </div>
          </div>
          <p className="text-xs text-slate-400">
            {model.daysCompleted}/{model.daysTotal} days cleared
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a1424]/70 p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Recent Achievements</p>
        {model.achievements.map((a) => (
          <AchievementRow key={a.id} item={a} />
        ))}
      </div>

      <Link
        href="/dsa/history"
        className="group flex items-center justify-between rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-indigo-900/20 p-4 transition-colors hover:border-cyan-400/40"
      >
        <div>
          <p className="text-sm font-semibold text-white">Compete with Friends</p>
          <p className="mt-1 text-[11px] text-slate-400">Climb the leaderboard and show your skills!</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
            View Leaderboard <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        <Trophy className="h-8 w-8 text-amber-300/80" />
      </Link>
    </aside>
  );
}
