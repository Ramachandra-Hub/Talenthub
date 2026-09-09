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
      <div className="space-y-4">
        <DsaArenaSubnav />
        <p className="text-sm text-rose-300">{error}</p>
        <Link href="/dsa-arena/contests" className="dj-btn dj-btn-ghost">
          Back to Contests
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
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

  return (
    <div className="space-y-4 pb-8">
      <DsaArenaSubnav />
      <section className="dj-panel rounded-md p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
          {detail.lifecycle} · {detail.durationMinutes} min · 3 Problems
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">{detail.title}</h2>
        <p className="mt-2 text-[13px] text-slate-300">{detail.description}</p>
        <p className="mt-3 text-[12px] text-slate-400">Languages: Java · Python</p>
      </section>

      <section className="dj-panel rounded-md p-4 sm:p-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Problems
        </h3>
        <ul className="mt-2 space-y-2">
          {detail.problems.map((p) => (
            <li
              key={p.position}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] py-2 last:border-0"
            >
              <div>
                <p className="text-[13px] font-semibold text-white">
                  {p.position}. {p.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  {p.difficulty}
                  {p.category ? ` · ${p.category}` : ''}
                </p>
              </div>
              <span className="text-[11px] tabular-nums text-cyan-200/90">{p.points} pts</span>
            </li>
          ))}
        </ul>
      </section>

      {detail.instructions ? (
        <section className="dj-panel rounded-md p-4 sm:p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Rules
          </h3>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] text-slate-300">
            {detail.instructions}
          </pre>
        </section>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="dj-btn dj-btn-primary"
          disabled={busy}
          onClick={() => void cta.action()}
        >
          {busy ? 'Please wait…' : cta.label}
        </button>
        <Link href="/dsa-arena/contests" className="dj-btn dj-btn-ghost">
          Back
        </Link>
      </div>
    </div>
  );
}
