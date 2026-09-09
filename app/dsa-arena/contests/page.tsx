'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
import { DsaArenaSubnav } from '@/components/dsa-arena/dsa-arena-subnav';

type ContestCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  problemCount: number;
  difficultyMix: string[];
  categories: Array<string | null>;
  lifecycle: string;
  attempt: {
    status: string;
    totalScore: number;
    maxScore: number;
    solvedCount: number;
  } | null;
};

export default function DsaArenaContestsPage() {
  return (
    <DsaArenaPageFrame title="DSA Arena" subtitle="Coding Contests">
      {() => <ContestsBody />}
    </DsaArenaPageFrame>
  );
}

function ContestsBody() {
  const [eligible, setEligible] = useState(true);
  const [contests, setContests] = useState<ContestCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/student/dsa/contests', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          eligible?: boolean;
          contests?: ContestCard[];
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? 'Could not load contests');
          return;
        }
        setEligible(Boolean(data.eligible));
        setContests(data.contests ?? []);
      } catch {
        setError('Could not load contests');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="space-y-4 pb-8">
      <DsaArenaSubnav />

      <section className="dj-panel rounded-md p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Arena Contests
        </p>
        <h2 className="mt-1 text-base font-semibold text-white">Coding Contests</h2>
        <p className="mt-1 text-[12px] text-slate-400">
          Each contest has exactly 3 coding problems. Java and Python. Graded on the server.
        </p>
      </section>

      {!eligible ? (
        <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90">
          Coding contests are available to <span className="font-semibold">IV Year</span> students
          only. Eligibility is checked on the server.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">Loading contests…</p>
      ) : error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : contests.length === 0 ? (
        <p className="text-sm text-slate-400">
          No published contests yet. Ask an admin to import the question bank and publish contests.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contests.map((c) => {
            const cta =
              c.attempt?.status === 'submitted'
                ? { href: `/dsa-arena/contest/${c.slug}/result`, label: 'View Result' }
                : c.attempt
                  ? { href: `/dsa-arena/contest/${c.slug}`, label: 'Continue Contest' }
                  : { href: `/dsa-arena/contest/${c.slug}`, label: 'Start Contest' };
            return (
              <article key={c.id} className="dj-panel rounded-md p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400/85">
                      {c.lifecycle}
                    </p>
                    <h3 className="mt-1 text-[15px] font-semibold text-white">{c.title}</h3>
                  </div>
                  <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                    3 Problems
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-slate-400 line-clamp-2">
                  {c.description || 'Solve three coding challenges in the professional Code Lab.'}
                </p>
                <p className="mt-3 text-[11px] text-slate-500">
                  Duration {c.durationMinutes} min · {c.difficultyMix.join(' / ') || 'mixed'}
                </p>
                {c.attempt ? (
                  <p className="mt-1 text-[11px] text-cyan-200/90">
                    Score {c.attempt.totalScore}/{c.attempt.maxScore} · Solved{' '}
                    {c.attempt.solvedCount}/3
                  </p>
                ) : null}
                <Link href={cta.href} className="dj-btn dj-btn-primary mt-4 inline-flex">
                  {cta.label}
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
