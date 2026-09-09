'use client';

import { Check, Circle, Lock, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArenaLiveMissionStatus, ArenaLiveTopicStatus } from '@/lib/dsa/arena-progression';

type Props = {
  status: ArenaLiveMissionStatus | ArenaLiveTopicStatus;
  boss?: boolean;
  className?: string;
};

export function MissionStatus({ status, boss, className }: Props) {
  if (boss && status === 'locked') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200/90', className)}>
        <Lock className="h-3.5 w-3.5" aria-hidden /> Boss locked
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300', className)}>
        <Check className="h-3.5 w-3.5" aria-hidden /> Completed
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300', className)}>
        <Circle className="h-3 w-3 fill-cyan-400 text-cyan-400" aria-hidden /> In Progress
      </span>
    );
  }
  if (status === 'available') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300', className)}>
        Available
      </span>
    );
  }
  if (status === 'unmapped') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500', className)}>
        <MinusCircle className="h-3.5 w-3.5" aria-hidden /> Not Connected
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500', className)}>
      <Lock className="h-3.5 w-3.5" aria-hidden /> Locked
    </span>
  );
}
