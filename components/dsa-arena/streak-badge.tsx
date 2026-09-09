'use client';

import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  streak: number;
  className?: string;
  demo?: boolean;
};

export function StreakBadge({ streak, className, demo }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[11px] font-bold text-orange-100',
        className,
      )}
    >
      <Flame className="h-3.5 w-3.5" aria-hidden />
      {streak} day streak
      {demo ? <span className="text-[9px] uppercase text-amber-300/90">demo</span> : null}
    </span>
  );
}
