'use client';

import { PortalPageFrame } from '@/components/student/portal/portal-page-frame';

const CONTESTS = [
  {
    id: '1',
    title: 'Weekend Array Blitz',
    when: 'Sat 6:00 PM',
    duration: '90 min',
    participants: 128,
    difficulty: 'Medium',
    reward: '+250 XP · +80 Coins',
    status: 'upcoming' as const,
  },
  {
    id: '2',
    title: 'Campus Coding Sprint',
    when: 'Live',
    duration: '60 min',
    participants: 64,
    difficulty: 'Hard',
    reward: '+400 XP · Badge',
    status: 'live' as const,
  },
  {
    id: '3',
    title: 'Freshers Warmup Cup',
    when: 'Completed',
    duration: '45 min',
    participants: 210,
    difficulty: 'Easy',
    reward: '+120 XP',
    status: 'completed' as const,
  },
];

export function ContestsView() {
  return (
    <PortalPageFrame title="CONTESTS" subtitle="Compete. Climb. Prove your edge.">
      <div className="space-y-4">
        {(['live', 'upcoming', 'completed'] as const).map((status) => (
          <section key={status} className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {status}
            </h2>
            {CONTESTS.filter((c) => c.status === status).map((c) => (
              <article
                key={c.id}
                className="ex-panel flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="text-[15px] font-semibold text-white">{c.title}</h3>
                  <p className="mt-1 text-[12px] text-slate-400">
                    {c.when} · {c.duration} · {c.participants} participants · {c.difficulty}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-amber-300/90">{c.reward}</p>
                </div>
                <button type="button" className="ex-btn-primary self-start sm:self-center" disabled={status === 'completed'}>
                  {status === 'live' ? 'Join now' : status === 'upcoming' ? 'Remind me' : 'View results'}
                </button>
              </article>
            ))}
          </section>
        ))}
      </div>
    </PortalPageFrame>
  );
}
