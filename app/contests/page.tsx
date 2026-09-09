'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContestCard, type ContestCardModel } from '@/components/dsa-arena/contest-card';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
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

export default function ContestsPage() {
  return (
    <DsaArenaPageFrame title="Contests" subtitle="Coding contests">
      {() => <ContestsBody />}
    </DsaArenaPageFrame>
  );
}

function ContestsBody() {
  const [eligible, setEligible] = useState(true);
  const [contests, setContests] = useState<ContestCardModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');

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

  return (
    <div className="space-y-4 pb-8">
      <section className="dj-panel rounded-md p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Portal · Contests
        </p>
        <h2 className="mt-1 text-base font-semibold text-white">Coding Contests</h2>
        <p className="mt-1 text-[12px] text-slate-400">
          Contests are separate from DSA Arena. Open this tab from the left nav anytime. Each
          contest has 3 problems — Java and Python — graded on the server.
        </p>
        {!loading && !error ? (
          <p className="mt-3 text-[12px] font-semibold tabular-nums text-cyan-200/90">
            {contests.length} contest{contests.length === 1 ? '' : 's'} available
          </p>
        ) : null}
      </section>

      {!eligible ? (
        <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90">
          Coding contests are available to <span className="font-semibold">IV Year</span> students
          only. You can browse the list; starting a contest is blocked until eligibility is met.
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
        <p className="text-sm text-slate-400">
          No published contests yet. Ask an admin to publish coding contests.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">No contests in this filter.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ContestCard key={c.id} contest={c} eligible={eligible} />
          ))}
        </div>
      )}
    </div>
  );
}
