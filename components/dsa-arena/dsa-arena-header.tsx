'use client';

import { LevelBadge } from '@/components/dsa-arena/level-badge';
import { StreakBadge } from '@/components/dsa-arena/streak-badge';
import { XpProgress } from '@/components/dsa-arena/xp-progress';
import type { ArenaDemoProfile } from '@/lib/dsa-arena/curriculum';

type Props = {
  title?: string;
  studentName: string;
  profile: ArenaDemoProfile;
};

export function DsaArenaHeader({ title = 'DSA Arena', studentName, profile }: Props) {
  return (
    <header className="dj-panel rounded-md px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400/85">
              ELEVATE-X
            </p>
            {profile.demo ? (
              <span className="rounded-sm border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Preview curriculum
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">{title}</h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Welcome back, {studentName}
            {profile.demo ? (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-400/90">
                stats below are demo — not live progress
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={profile.level} demo={profile.demo} />
          <span className="text-[12px] font-semibold tabular-nums text-slate-300">
            {profile.xp.toLocaleString()} XP
            {profile.demo ? (
              <span className="ml-1 text-[9px] font-bold uppercase text-amber-400/80">demo</span>
            ) : null}
          </span>
          <StreakBadge streak={profile.streak} demo={profile.demo} />
        </div>
      </div>
      <XpProgress
        className="mt-4"
        xp={profile.xp}
        xpToNext={profile.xpToNext}
        demo={profile.demo}
      />
    </header>
  );
}
