'use client';

import Link from 'next/link';
import { MissionStatus } from '@/components/dsa-arena/mission-status';
import type { ArenaMissionConfig } from '@/lib/dsa-arena/curriculum';
import type { ArenaMissionProgress } from '@/lib/dsa/arena-progression';
import { cn } from '@/lib/utils';

type Props = {
  topicId: string;
  mission: ArenaMissionConfig;
  live?: ArenaMissionProgress | null;
  className?: string;
};

export function MissionCard({ topicId, mission, live, className }: Props) {
  const status = live?.status ?? 'unmapped';
  const locked = status === 'locked';
  const unmapped = status === 'unmapped';
  const href = `/dsa-arena/mission/${topicId}/${mission.id}`;

  const codingLabel =
    live?.totalCoding != null && live.completedCoding != null
      ? `Code ${live.completedCoding}/${live.totalCoding}`
      : null;
  const mcqLabel =
    live?.totalMcq != null && live.attemptedMcq != null
      ? `MCQ ${live.attemptedMcq}/${live.totalMcq}`
      : null;

  return (
    <article
      className={cn(
        'dj-panel rounded-md p-4',
        (locked || unmapped) && 'opacity-60',
        status === 'in_progress' && 'ring-1 ring-cyan-400/35',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {String(mission.number).padStart(2, '0')}
        </p>
        <MissionStatus status={status} />
      </div>
      <h3 className="mt-2 text-[15px] font-semibold text-white">{mission.title}</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{mission.description}</p>
      <p className="mt-3 text-[11px] text-slate-500">{mission.skills.join(' · ')}</p>
      {(codingLabel || mcqLabel) && live?.mapped ? (
        <p className="mt-2 text-[11px] tabular-nums text-slate-400">
          {[codingLabel, mcqLabel].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-cyan-200/90">
          +{mission.xp} XP
          <span className="ml-1 text-[9px] font-bold uppercase text-amber-400/80">preview</span>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {mission.difficulty}
        </span>
      </div>
      {locked || unmapped ? (
        <button type="button" className="dj-btn dj-btn-ghost mt-4 w-full" disabled>
          {unmapped ? 'Not Connected' : 'Locked'}
        </button>
      ) : (
        <Link
          href={href}
          className={cn(
            'dj-btn mt-4 w-full',
            status === 'completed' ? 'dj-btn-ghost' : 'dj-btn-primary',
          )}
        >
          {status === 'completed'
            ? 'Review Mission'
            : status === 'in_progress'
              ? 'Continue Mission'
              : 'Open Mission'}
        </Link>
      )}
    </article>
  );
}
