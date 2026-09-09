'use client';

import Link from 'next/link';
import { Check, Circle, Lock, MinusCircle, Star } from 'lucide-react';
import type { ArenaTopicConfig } from '@/lib/dsa-arena/curriculum';
import type { ArenaTopicProgress } from '@/lib/dsa/arena-progression';
import { cn } from '@/lib/utils';

type Props = {
  topic: ArenaTopicConfig;
  live?: ArenaTopicProgress | null;
  showConnector?: boolean;
};

export function RoadmapNode({ topic, live, showConnector }: Props) {
  const status = live?.status ?? 'unmapped';
  const isBoss = topic.id === 'dsa-master';
  const canOpen = status !== 'locked'; // unmapped topics still browsable for honesty
  const href = canOpen ? `/dsa-arena/topic/${topic.id}` : undefined;

  const icon =
    status === 'completed' ? (
      <Check className="h-4 w-4 text-emerald-300" aria-hidden />
    ) : status === 'in_progress' ? (
      <Circle className="h-3.5 w-3.5 fill-cyan-400 text-cyan-400" aria-hidden />
    ) : status === 'unmapped' ? (
      <MinusCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden />
    ) : isBoss ? (
      <Star className="h-4 w-4 text-amber-300" aria-hidden />
    ) : status === 'available' ? (
      <Circle className="h-3.5 w-3.5 text-slate-300" aria-hidden />
    ) : (
      <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden />
    );

  const body = (
    <div
      className={cn(
        'dj-roadmap-node rounded-md',
        status === 'in_progress' && 'is-current',
        status === 'completed' && 'is-completed',
        (status === 'locked' || status === 'unmapped') && 'is-locked',
        isBoss && 'is-boss',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {isBoss ? 'Final boss' : 'Topic'}
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-white">{topic.title}</h3>
          <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{topic.description}</p>
        </div>
        <span className="shrink-0" aria-label={status}>
          {icon}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {live && live.mappedMissionCount > 0 ? (
          <>
            <span>
              {live.completedMappedCount}/{live.mappedMissionCount} mapped missions
            </span>
            <span>{live.mappedCompletionPercent}% mapped complete</span>
          </>
        ) : (
          <span className="font-bold uppercase tracking-wide text-amber-400/80">
            no live mapping
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="dj-roadmap-item">
      {href ? (
        <Link
          href={href}
          className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
        >
          {body}
        </Link>
      ) : (
        body
      )}
      {showConnector ? <div className="dj-roadmap-connector" aria-hidden /> : null}
    </div>
  );
}
