'use client';

import { cn } from '@/lib/utils';

type Props = {
  xp: number;
  xpToNext: number;
  className?: string;
  label?: string;
  demo?: boolean;
};

export function XpProgress({ xp, xpToNext, className, label, demo }: Props) {
  const pct = xpToNext > 0 ? Math.min(100, Math.round((xp / xpToNext) * 100)) : 0;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-300">{label ?? 'XP Progress'}</span>
        <span className="tabular-nums text-slate-400">
          {xp.toLocaleString()} / {xpToNext.toLocaleString()} XP
          {demo ? <span className="ml-1 text-[9px] uppercase text-amber-400/80">demo</span> : null}
        </span>
      </div>
      <div className="dj-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
