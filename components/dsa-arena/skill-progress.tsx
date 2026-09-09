'use client';

import { cn } from '@/lib/utils';

type Props = {
  skills: string[];
  className?: string;
};

export function SkillProgress({ skills, className }: Props) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {skills.map((skill) => (
        <span
          key={skill}
          className="rounded-sm border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
        >
          {skill}
        </span>
      ))}
    </div>
  );
}
