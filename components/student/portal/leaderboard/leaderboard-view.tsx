'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PortalPageFrame } from '@/components/student/portal/portal-page-frame';

const TABS = ['Global', 'Batch', 'College', 'Friends'] as const;

const ROWS = [
  { rank: 1, name: 'Ananya R', level: 12, xp: 9200, score: 98 },
  { rank: 2, name: 'Karthik M', level: 11, xp: 8700, score: 95 },
  { rank: 3, name: 'Harsha', level: 6, xp: 4500, score: 88, you: true },
  { rank: 4, name: 'Sneha P', level: 9, xp: 7100, score: 86 },
  { rank: 5, name: 'Vikram S', level: 8, xp: 6400, score: 84 },
];

export function LeaderboardView() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('College');

  return (
    <PortalPageFrame title="LEADERBOARD" subtitle="Climb the ranks. Show your skills.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 border-b border-white/[0.07]">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'relative -mb-px rounded-t-md px-3.5 py-2 text-[11px] font-semibold tracking-wide transition-colors duration-200',
                tab === t
                  ? 'text-cyan-100 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-cyan-400'
                  : 'text-slate-500 hover:text-slate-200',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ex-panel overflow-hidden rounded-xl">
          <div className="grid grid-cols-[48px_1fr_64px_72px_64px] gap-2 border-b border-white/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Rank</span>
            <span>Student</span>
            <span>Level</span>
            <span>XP</span>
            <span>Score</span>
          </div>
          {ROWS.map((row) => (
            <div
              key={row.rank}
              className={cn(
                'grid grid-cols-[48px_1fr_64px_72px_64px] gap-2 border-b border-white/[0.04] px-4 py-3 text-[13px]',
                row.you && 'bg-cyan-500/10',
              )}
            >
              <span className="font-bold tabular-nums text-slate-300">#{row.rank}</span>
              <span className="font-semibold text-white">
                {row.name}
                {row.you ? <span className="ml-2 text-[10px] font-bold text-cyan-300">YOU</span> : null}
              </span>
              <span className="tabular-nums text-slate-400">{row.level}</span>
              <span className="tabular-nums text-slate-300">{row.xp}</span>
              <span className="tabular-nums text-cyan-200">{row.score}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Showing {tab} standings (preview data until live ranking API is connected).
        </p>
      </div>
    </PortalPageFrame>
  );
}
