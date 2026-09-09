'use client';

import { Lock, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PortalPageFrame } from '@/components/student/portal/portal-page-frame';

const CATS = ['DSA', 'Coding', 'Consistency', 'Exams', 'Contests'] as const;

const BADGES = [
  { id: '1', cat: 'DSA', title: 'First Step', description: 'Completed your first mission', unlocked: true, tone: 'emerald' },
  { id: '2', cat: 'DSA', title: 'Array Novice', description: 'Solved 5 array problems', unlocked: true, tone: 'cyan' },
  { id: '3', cat: 'Consistency', title: 'Streak Master', description: '7 day coding streak', unlocked: true, tone: 'orange' },
  { id: '4', cat: 'Coding', title: 'Clean Compile', description: 'Pass all tests on first submit', unlocked: false, tone: 'violet' },
  { id: '5', cat: 'Exams', title: 'Exam Ready', description: 'Finish a timed assessment', unlocked: false, tone: 'cyan' },
  { id: '6', cat: 'Contests', title: 'Podium Push', description: 'Finish top 10 in a contest', unlocked: false, tone: 'orange' },
];

export function AchievementsView() {
  return (
    <PortalPageFrame title="HALL OF CHAMPIONS" subtitle="Badges earned through real progress.">
      <div className="space-y-5">
        {CATS.map((cat) => {
          const items = BADGES.filter((b) => b.cat === cat);
          if (!items.length) return null;
          return (
            <section key={cat}>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {cat}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((b) => (
                  <article
                    key={b.id}
                    className={cn(
                      'ex-panel flex items-start gap-3 rounded-xl p-4',
                      !b.unlocked && 'opacity-45 grayscale',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white',
                        b.tone === 'emerald' && 'from-emerald-300 to-emerald-700',
                        b.tone === 'cyan' && 'from-cyan-300 to-blue-700',
                        b.tone === 'orange' && 'from-amber-300 to-orange-700',
                        b.tone === 'violet' && 'from-violet-300 to-purple-800',
                      )}
                    >
                      {b.unlocked ? <Shield className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold text-white">{b.title}</p>
                      <p className="mt-1 text-[12px] text-slate-400">{b.description}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
                        {b.unlocked ? 'Unlocked' : 'Locked'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PortalPageFrame>
  );
}
