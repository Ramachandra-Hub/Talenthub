'use client';

import Link from 'next/link';
import { MissionStatus } from '@/components/dsa-arena/mission-status';
import type { ArenaBossConfig } from '@/lib/dsa-arena/curriculum';
import { cn } from '@/lib/utils';

type Props = {
  boss: ArenaBossConfig;
  className?: string;
};

export function BossCard({ boss, className }: Props) {
  const locked = boss.status === 'locked';
  return (
    <article
      className={cn(
        'dj-panel rounded-md border-amber-400/25 p-4',
        locked && 'opacity-70',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300/90">
          Boss challenge
        </p>
        <MissionStatus
          status={
            boss.status === 'current'
              ? 'in_progress'
              : boss.status === 'completed'
                ? 'completed'
                : boss.status === 'available'
                  ? 'available'
                  : 'locked'
          }
          boss
        />
      </div>
      <h3 className="mt-2 text-base font-semibold text-white">{boss.title}</h3>
      <p className="mt-1.5 text-[12px] text-slate-400">{boss.description}</p>
      <p className="mt-3 text-[11px] text-slate-500">
        Difficulty: {boss.difficulty} · Reward: +{boss.xp} XP{' '}
        <span className="uppercase text-amber-400/80">preview</span>
      </p>
      {locked || !boss.href ? (
        <button type="button" className="dj-btn dj-btn-ghost mt-4 w-full" disabled>
          Locked
        </button>
      ) : (
        <Link href={boss.href} className="dj-btn dj-btn-primary mt-4 w-full">
          Start Boss
        </Link>
      )}
    </article>
  );
}
