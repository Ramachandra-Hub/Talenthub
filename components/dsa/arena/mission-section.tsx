'use client';

import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArenaMission, ArenaMissionType } from '@/components/dsa/arena/arena-types';

const TABS: Array<{ id: 'all' | ArenaMissionType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'learn', label: 'Learn' },
  { id: 'brain_candy', label: 'Brain Candy' },
  { id: 'code', label: 'Code Missions' },
  { id: 'challenge', label: 'Challenges' },
  { id: 'boss', label: 'Boss Fight' },
];

const TYPE_META: Record<
  ArenaMissionType,
  { badge: string; art: string }
> = {
  learn: {
    badge: 'LEARN',
    art: 'from-emerald-900/80 via-slate-900/40 to-transparent',
  },
  brain_candy: {
    badge: 'BRAIN CANDY',
    art: 'from-violet-900/80 via-indigo-950/50 to-transparent',
  },
  code: {
    badge: 'CODE MISSION',
    art: 'from-cyan-900/80 via-slate-950/50 to-transparent',
  },
  challenge: {
    badge: 'CHALLENGE',
    art: 'from-orange-900/80 via-rose-950/40 to-transparent',
  },
  boss: {
    badge: 'BOSS FIGHT',
    art: 'from-red-900/80 via-amber-950/50 to-transparent',
  },
};

type Props = {
  missions: ArenaMission[];
  tab: 'all' | ArenaMissionType;
  onTabChange: (tab: 'all' | ArenaMissionType) => void;
  weekTitle: string;
  topicName: string;
  daysCompleted: number;
  daysTotal: number;
};

export function MissionSection({
  missions,
  tab,
  onTabChange,
  weekTitle,
  topicName,
  daysCompleted,
  daysTotal,
}: Props) {
  const filtered = tab === 'all' ? missions : missions.filter((m) => m.type === tab);
  const pct = daysTotal ? Math.round((daysCompleted / daysTotal) * 100) : 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">{weekTitle}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Master the building blocks. {topicName} power real interview problems.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#22d3ee ${pct}%, rgba(255,255,255,0.08) 0)` }}
          >
            <div className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-[#0a1424] text-[10px] font-bold leading-tight text-white">
              <span>
                {daysCompleted}/{daysTotal}
              </span>
              <span className="text-[8px] font-medium text-slate-400">Done</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-cyan-300">View Learning Path →</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Mission filters">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors duration-200',
              tab === t.id
                ? 'bg-cyan-500/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
        {!filtered.length ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-500">
            No missions in this category yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MissionCard({ mission }: { mission: ArenaMission }) {
  const meta = TYPE_META[mission.type];
  const locked = mission.status === 'locked';
  const done = mission.status === 'completed';

  const body = (
    <article
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1524]/80 transition-all duration-200',
        !locked && 'hover:-translate-y-0.5 hover:border-cyan-400/30 hover:shadow-[0_12px_32px_rgba(8,145,178,0.15)]',
        locked && 'opacity-70',
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-r', meta.art)} />
      <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-md border border-white/15 bg-black/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-200">
            {meta.badge}
          </span>
          <h3 className="mt-2 text-base font-semibold text-white sm:text-lg">{mission.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{mission.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
            {mission.xp > 0 ? (
              <span className="font-semibold text-amber-300/90">+{mission.xp} XP</span>
            ) : null}
            {mission.coins > 0 ? (
              <span className="font-semibold text-cyan-300/80">+{mission.coins} Coins</span>
            ) : null}
            {mission.progressLabel ? (
              <span className="text-slate-400">{mission.progressLabel}</span>
            ) : null}
            {locked && mission.lockReason ? (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Lock className="h-3 w-3" /> {mission.lockReason}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0">
          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-500">
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          ) : done ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200">
              Review <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-100 group-hover:bg-cyan-500/30">
              Start <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </article>
  );

  if (!mission.href || locked) return body;
  return (
    <Link href={mission.href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 rounded-2xl">
      {body}
    </Link>
  );
}
