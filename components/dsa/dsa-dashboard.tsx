'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { DsaJourneyMap } from '@/components/dsa/dsa-journey-map';
import { getClientUser } from '@/lib/client-auth';

type DayRow = {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
  stars: number;
  lockReason: string | null;
};

type WeekRow = {
  id: string;
  weekNumber: number;
  title: string;
  topicName: string;
  status: string;
  attemptNumber: number;
  daysCompleted: number;
  daysTotal: number;
  progressPercent: number;
  qualificationStatus: string;
  failedAttempts: number;
  currentDay: number | null;
  lockReason?: string;
  days: DayRow[];
};

type Dashboard = {
  program: { title: string; daysPerWeek: number };
  level: { title: string };
  config: { mcqsPerDay: number; codingProblemsPerDay: number };
  currentWeek: WeekRow;
  weeks: WeekRow[];
};

const CHEER_LINES = [
  'Your brain called — it wants more algorithms! 🧠🍭',
  'Arrays fear you. Strings respect you.',
  'One day at a time. No skipping. No cheating. (The server is watching.)',
];

export function DsaDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        const res = await fetch('/api/student/dsa/dashboard', { credentials: 'include' });
        const json = (await res.json()) as Dashboard & { error?: string };
        if (!res.ok) {
          setError(json.error ?? 'Could not load adventure map');
          return;
        }
        setData(json);
      } catch {
        setError('The candy road is offline. Try again!');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [router]);

  if (loading) {
    return (
      <div className="dsa-game-bg px-4 py-10">
        <Skeleton className="h-24 w-full max-w-lg mx-auto rounded-3xl bg-white/20" />
        <Skeleton className="h-96 w-full max-w-md mx-auto mt-6 rounded-3xl bg-white/20" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border-4 border-rose-300 bg-white/95 p-6 text-center shadow-xl">
          <p className="text-4xl mb-2">😵</p>
          <p className="font-black text-purple-900">Oops! Map failed to load</p>
          <p className="text-sm text-slate-600 mt-2">{error}</p>
          <button
            type="button"
            className="mt-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-2.5 text-sm font-bold text-white"
            onClick={() => window.location.reload()}
          >
            Retry quest
          </button>
        </div>
      </div>
    );
  }

  if (!data?.currentWeek) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center px-4">
        <p className="text-white font-bold">No levels configured yet. Check back soon!</p>
      </div>
    );
  }

  const current = data.currentWeek;
  const openDay = current.days.find((d) => d.status === 'in_progress' || d.status === 'available');
  const cheer = CHEER_LINES[current.weekNumber % CHEER_LINES.length];
  const totalStars = data.weeks.flatMap((w) => w.days).reduce((s, d) => s + (d.stars ?? 0), 0);

  return (
    <div className="dsa-game-bg min-h-screen pb-16">
      <header className="relative overflow-hidden border-b-4 border-amber-300/60 bg-gradient-to-r from-violet-700 via-fuchsia-600 to-rose-500 px-4 py-8">
        <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.15%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
        <div className="relative mx-auto max-w-lg text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-200">Road to Success</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]">
            {data.level.title}
          </h1>
          <p className="mt-2 text-sm font-bold text-white/90">{data.program.title}</p>
          <div className="mt-4 inline-flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-white/20 border border-white/30 px-3 py-1 text-xs font-black text-white">
              ⭐ {totalStars} stars collected
            </span>
            <span className="rounded-full bg-white/20 border border-white/30 px-3 py-1 text-xs font-black text-white">
              🍬 {data.config?.mcqsPerDay ?? 5} MCQs · 💻 {data.config?.codingProblemsPerDay ?? 3} code quests / day
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
        <div className="flex flex-wrap justify-between gap-2 text-xs font-bold">
          <Link href="/exams" className="text-amber-100 hover:text-white underline-offset-2 hover:underline">
            ← Back to exams
          </Link>
          <Link href="/dsa/history" className="text-amber-100 hover:text-white underline-offset-2 hover:underline">
            Trophy room →
          </Link>
        </div>

        <div className="rounded-2xl border-2 border-white/30 bg-white/15 backdrop-blur-sm px-4 py-3 text-center">
          <p className="text-sm font-bold text-amber-100">{cheer}</p>
        </div>

        {openDay ? (
          <Link
            href={`/dsa/day/${openDay.id}`}
            className="block rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 border-4 border-white px-5 py-4 text-center shadow-[0_8px_0_rgba(180,83,9,0.4)] hover:translate-y-0.5 hover:shadow-[0_4px_0_rgba(180,83,9,0.4)] transition-all"
          >
            <p className="text-xs font-black uppercase tracking-widest text-amber-900/80">Continue adventure</p>
            <p className="text-xl font-black text-amber-950 mt-1">
              Play {openDay.title} →
            </p>
            <p className="text-[11px] font-bold text-amber-900/70 mt-1">
              5 brain candies (MCQs) + 3 code bosses · Java or Python only
            </p>
          </Link>
        ) : null}

        {current.failedAttempts > 0 ? (
          <p className="text-center text-xs font-bold text-rose-200 bg-rose-900/30 rounded-xl py-2 px-3 border border-rose-400/30">
            💀 {current.failedAttempts} failed run(s) on record — respawn and try again!
          </p>
        ) : null}

        {current.qualificationStatus === 'qualified' ? (
          <p className="text-center text-sm font-black text-lime-200 bg-lime-900/30 rounded-xl py-3 border-2 border-lime-400/50">
            🎓 Assignment attendance — QUALIFIED!
          </p>
        ) : null}

        <DsaJourneyMap
          weekTitle={current.title}
          topicName={current.topicName}
          days={current.days}
          weekStatus={current.status}
          weekId={current.id}
          isLocked={Boolean(current.lockReason)}
        />

        {data.weeks.length > 1 ? (
          <div className="space-y-4 pt-2">
            <p className="text-xs font-black uppercase tracking-widest text-amber-200/90 text-center">
              More worlds
            </p>
            {data.weeks
              .filter((w) => w.id !== current.id)
              .map((week) => (
                <DsaJourneyMap
                  key={week.id}
                  weekTitle={week.title}
                  topicName={week.topicName}
                  days={week.days}
                  weekStatus={week.status}
                  weekId={week.id}
                  isLocked={Boolean(week.lockReason) || week.status === 'locked'}
                />
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
