'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';

type Detail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number;
  lifecycle: string;
  problems: Array<{
    position: number;
    title: string;
    difficulty: string;
    category: string | null;
    tags?: string[];
    points: number;
  }>;
  attempt: { id: string; status: string } | null;
};

export default function ContestBriefPage() {
  return (
    <DsaArenaPageFrame title="Contests" subtitle="Contest brief">
      {() => <BriefBody />}
    </DsaArenaPageFrame>
  );
}

function BriefBody() {
  const params = useParams();
  const router = useRouter();
  const contestId = String(params.contestId ?? '');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/student/dsa/contests/${encodeURIComponent(contestId)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to load contest');
          return;
        }
        setDetail(data as Detail);
      } catch {
        setError('Failed to load contest');
      }
    };
    void load();
  }, [contestId]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/dsa/contests/${encodeURIComponent(contestId)}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start contest');
        return;
      }
      if (data.completed) {
        router.push(`/dsa-arena/contest/${contestId}/result`);
        return;
      }
      router.push(`/dsa-arena/contest/${contestId}/lab`);
    } catch {
      setError('Could not start contest');
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <Link href="/dsa-arena/contest" className="dj-btn dj-btn-ghost">
          ← Back to Contests
        </Link>
      </div>
    );
  }

  if (!detail) {
    return <p className="text-sm text-slate-400">Loading contest…</p>;
  }

  const submitted = detail.attempt?.status === 'submitted';
  const inProgress = Boolean(detail.attempt && !submitted);
  const canStart = detail.lifecycle === 'live' && !detail.attempt;

  const primary = submitted
    ? {
        label: 'View Result',
        action: () => router.push(`/dsa-arena/contest/${contestId}/result`),
      }
    : inProgress
      ? {
          label: 'Continue Contest',
          action: () => router.push(`/dsa-arena/contest/${contestId}/lab`),
        }
      : canStart
        ? { label: 'Start Contest', action: () => void start() }
        : null;

  const difficultyMix = detail.problems.map((p) => p.difficulty).join(' → ');

  return (
    <div className="space-y-3 pb-4">
      <Link
        href="/dsa-arena/contest"
        className="inline-flex text-[12px] font-semibold text-cyan-300/90 hover:text-cyan-200"
      >
        ← Contests
      </Link>

      <article className="dj-panel rounded-md p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
              Coding Contest · {detail.lifecycle}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">{detail.title}</h1>
          </div>
          <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
            3 Problems
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{detail.description}</p>

        <div className="mt-4 grid gap-2 text-[12px] text-slate-400 sm:grid-cols-3">
          <p>
            <span className="text-slate-500">Duration</span>
            <br />
            {detail.durationMinutes} minutes
          </p>
          <p>
            <span className="text-slate-500">Difficulty</span>
            <br />
            {difficultyMix || 'mixed'}
          </p>
          <p>
            <span className="text-slate-500">Languages</span>
            <br />
            Java · Python
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Rules
            </h3>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-300">
              {detail.instructions ||
                'Solve exactly 3 coding problems in Java or Python. Server-side grading only.'}
            </pre>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Problems
            </h3>
            <ul className="mt-2 space-y-2">
              {detail.problems.map((p) => (
                <li
                  key={p.position}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <p className="text-[13px] font-semibold text-white">
                    Problem {p.position} · {p.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {p.difficulty}
                    {p.category ? ` · ${p.category}` : ''}
                    {p.tags?.length ? ` · ${p.tags.join(', ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        {!primary ? (
          <p className="mt-4 text-[12px] text-amber-100/90">
            This contest cannot be started right now ({detail.lifecycle}).
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {primary ? (
            <button
              type="button"
              className="dj-btn dj-btn-primary"
              disabled={busy}
              onClick={() => void primary.action()}
            >
              {busy ? 'Please wait…' : primary.label}
            </button>
          ) : null}
          <Link href="/dsa-arena/contest" className="dj-btn dj-btn-ghost">
            Back to Contests
          </Link>
        </div>
      </article>
    </div>
  );
}
