'use client';

import { Award, Flame, Sparkles, Zap } from 'lucide-react';
import type { ArenaAchievementDemo } from '@/lib/dsa-arena/curriculum';
import { cn } from '@/lib/utils';

const ICONS = {
  trophy: Award,
  bolt: Zap,
  flame: Flame,
  star: Sparkles,
};

type Props = {
  achievement: ArenaAchievementDemo;
  className?: string;
};

export function AchievementCard({ achievement, className }: Props) {
  const Icon = ICONS[achievement.icon];
  return (
    <div
      className={cn(
        'dj-panel flex items-center gap-2.5 rounded-md px-3 py-2.5',
        !achievement.earned && 'opacity-45',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-slate-100">{achievement.title}</p>
        <p className="text-[10px] text-slate-500">
          {achievement.earned ? 'Earned' : 'Locked'}
          <span className="ml-1 uppercase text-amber-400/80">· demo</span>
        </p>
      </div>
    </div>
  );
}
