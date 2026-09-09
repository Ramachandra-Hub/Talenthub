'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
import { DsaArenaSubnav } from '@/components/dsa-arena/dsa-arena-subnav';

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
    <DsaArenaPageFrame title="DSA Arena" subtitle="Contest Brief">
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
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) {
    return (
      <div className="space-y-3">
        <DsaArenaSubnav />
        <p className="text-sm text-rose-300">{error}</p>
        <Link href="/dsa-arena/contest" className="dj-btn dj-btn-ghost">
          Back to Contest
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-3">
        <DsaArenaSubnav />
        <p className="text-sm text-slate-400">Loading contest…</p>
      </div>
    );
  }

  const cta =
    detail.attempt?.status === 'submitted'
      ? { label: 'View Result', action: () => router.push(`/dsa-arena/contest/${contestId}/result`) }
      : detail.attempt
        ? { label: 'Continue Contest', action: start }
        : { label: 'Start Contest', action: start };

  const difficultyMix = detail.problems.map((p) => p.difficulty).join(' → ');

  return (
    <div className="space-y-3 pb-4">
      <DsaArenaSubnav />

      <section className="dj-panel rounded-md p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
                {detail.lifecycle} · 3 Problems · {detail.durationMinutes} Minutes
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">{detail.title}</h2>
              <p className="mt-1 text-[12px] text-slate-400">{difficultyMix || 'mixed difficulty'}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
                {detail.description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
                  Eligibility
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
                  IV Year students only. Languages: Java · Python. Eligibility is enforced
                  server-side when you start.
                </p>
                <p className="mt-2 text-[12px] text-slate-400">
                  Status: <span className="text-slate-200">{detail.lifecycle}</span>
                  {detail.attempt ? ` · Attempt ${detail.attempt.status}` : ' · Not started'}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0">
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

            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="dj-btn dj-btn-primary"
                disabled={busy}
                onClick={() => void cta.action()}
              >
                {busy ? 'Please wait…' : cta.label}
              </button>
              <Link href="/dsa-arena/contest" className="dj-btn dj-btn-ghost">
                Back
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
