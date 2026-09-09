'use client';

import { cn } from '@/lib/utils';

type Props = {
  level: number;
  className?: string;
  demo?: boolean;
};

export function LevelBadge({ level, className, demo }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-cyan-100',
        className,
      )}
    >
      Level {level}
      {demo ? <span className="text-[9px] uppercase text-amber-300/90">demo</span> : null}
    </span>
  );
}
