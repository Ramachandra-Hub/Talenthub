'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContestCard, type ContestCardModel } from '@/components/dsa-arena/contest-card';
import { PortalShell } from '@/components/student/portal/portal-shell';
import { PortalHudCard, PortalQuickLinks } from '@/components/student/portal/portal-hud';
import { derivePortalGamification } from '@/components/student/portal/portal-gamification';
import { getClientUser } from '@/lib/client-auth';
import { cn } from '@/lib/utils';

type FilterId = 'all' | 'live' | 'in_progress' | 'completed' | 'upcoming' | 'ended';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Available' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'ended', label: 'Ended' },
];

function matchesFilter(c: ContestCardModel, filter: FilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return c.attempt?.status === 'submitted';
  if (filter === 'in_progress') {
    return Boolean(c.attempt && c.attempt.status !== 'submitted');
  }
  if (filter === 'live') {
    return c.lifecycle === 'live' && !c.attempt;
  }
  return c.lifecycle === filter;
}

/** Contests as a top-level portal section — same chrome as Home / Exam Center. */
export function ContestsView() {
  const router = useRouter();
  const [name, setName] = useState('Student');
  const [booting, setBooting] = useState(true);
  const [eligible, setEligible] = useState(true);
  const [contests, setContests] = useState<ContestCardModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        const hubRes = await fetch('/api/student/hub', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (hubRes.ok) {
          const hub = (await hubRes.json()) as { student?: { name?: string } };
          if (hub.student?.name) setName(hub.student.name);
        }
      } finally {
        setBooting(false);
      }
    };
    void boot();
  }, [router]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/student/dsa/contests', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          eligible?: boolean;
          contests?: ContestCardModel[];
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? 'Could not load contests');
          return;
        }
        setEligible(Boolean(data.eligible));
        setContests(Array.isArray(data.contests) ? data.contests : []);
      } catch {
        setError('Could not load contests');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(
    () => contests.filter((c) => matchesFilter(c, filter)),
    [contests, filter],
  );

  const g = derivePortalGamification({ rollNumber: name, completedDays: 2 });

  if (booting) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Loading Contests…
      </div>
    );
  }

  return (
    <PortalShell
      title="CONTESTS"
      subtitle="Coding contests — separate from DSA Arena."
      studentName={name}
      gamification={g}
      rightPanel={
        <div className="space-y-3.5">
          <PortalHudCard gamification={g} studentName={name} />
          <div className="ex-panel rounded-lg p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Contest tip
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-300">
              Each contest has 3 problems. Use Java or Python. Finish when you are ready to lock
              your score.
            </p>
          </div>
          <PortalQuickLinks />
        </div>
      }
    >
      <div className="space-y-5">
        <section className="ex-panel rounded-lg p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Left nav · Contests
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">All coding contests</h2>
          <p className="mt-1 text-[12px] text-slate-400">
            Open Contests from the left sidebar anytime — you do not need to enter DSA Arena.
          </p>
          {!loading && !error ? (
            <p className="mt-3 text-[12px] font-semibold tabular-nums text-cyan-200/90">
              {contests.length} contest{contests.length === 1 ? '' : 's'} available
            </p>
          ) : null}
        </section>

        {!eligible ? (
          <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90">
            Coding contests are available to <span className="font-semibold">IV Year</span> students
            only. You can browse the list; starting is blocked until eligibility is met.
          </p>
        ) : null}

        <div
          className="flex flex-wrap gap-1 border-b border-white/[0.07] pb-px"
          role="tablist"
          aria-label="Contest filters"
        >
          {FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={cn(
                'rounded-t-md px-3 py-1.5 text-[12px] font-semibold transition',
                filter === t.id
                  ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/35'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading contests…</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : contests.length === 0 ? (
          <p className="text-sm text-slate-400">No published contests yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No contests in this filter.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <ContestCard key={c.id} contest={c} eligible={eligible} variant="portal" />
            ))}
          </div>
        )}

        <p className="text-[12px] text-slate-500">
          Looking for the coding journey?{' '}
          <Link href="/dsa-arena" className="font-semibold text-cyan-300 hover:text-cyan-200">
            Open DSA Arena
          </Link>
        </p>
      </div>
    </PortalShell>
  );
}
