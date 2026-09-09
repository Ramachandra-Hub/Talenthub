'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContestsPortalFrame } from '@/components/student/portal/contests/contests-portal-frame';

type ResultPayload = {
  contest: { title: string; slug: string };
  attempt: {
    status: string;
    totalScore: number;
    maxScore: number;
    solvedCount: number;
    percentage: number;
    durationSeconds: number | null;
  };
  problems: Array<{
    position: number;
    title: string;
    language: string | null;
    status: string;
    scorePercent: number;
    passed: number;
    total: number;
    compileOk: boolean | null;
    runtimeMs: number | null;
    submissionCount: number;
  }>;
  history: Array<{
    id: string;
    problemTitle: string;
    language: string;
    status: string;
    scorePercent: number;
    passed: number;
    total: number;
    runtimeMs: number | null;
    submittedAt: string;
  }>;
};

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ContestResultPage() {
  return (
    <ContestsPortalFrame title="CONTESTS" subtitle="Contest result">
      <ResultBody />
    </ContestsPortalFrame>
  );
}

function ResultBody() {
  const params = useParams();
  const contestId = String(params.contestId ?? '');
  const [data, setData] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `/api/student/dsa/contests/${encodeURIComponent(contestId)}/result`,
          { credentials: 'include', cache: 'no-store' },
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Failed to load result');
          return;
        }
        setData(json as ResultPayload);
      } catch {
        setError('Failed to load result');
      }
    };
    void load();
  }, [contestId]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <Link href="/contests" className="ex-btn-ghost">
          ← Back to Contests
        </Link>
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-slate-400">Loading result…</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <Link
        href="/contests"
        className="inline-flex text-[12px] font-semibold text-cyan-300/90 hover:text-cyan-200"
      >
        ← Contests
      </Link>

      <section className="ex-panel rounded-lg p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
          Coding Contest Result
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">{data.contest.title}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat label="Solved" value={`${data.attempt.solvedCount} / 3`} />
          <Stat
            label="Score"
            value={`${data.attempt.totalScore} / ${data.attempt.maxScore}`}
          />
          <Stat label="Percentage" value={`${data.attempt.percentage}%`} />
          <Stat label="Time" value={formatDuration(data.attempt.durationSeconds)} />
        </div>
      </section>

      <section className="ex-panel rounded-lg p-4 sm:p-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Problem Results
        </h3>
        <ul className="mt-2 space-y-2">
          {data.problems.map((p) => (
            <li
              key={p.position}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] py-2 last:border-0"
            >
              <div>
                <p className="text-[13px] font-semibold text-white">
                  {p.position}. {p.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  {p.language ?? '—'} · {p.passed}/{p.total} tests · {p.submissionCount}{' '}
                  submission(s)
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-semibold uppercase text-cyan-200">{p.status}</p>
                <p className="text-[11px] tabular-nums text-slate-400">{p.scorePercent}%</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="ex-panel rounded-lg p-4 sm:p-5 overflow-x-auto">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Submission History
        </h3>
        <table className="mt-3 w-full min-w-[640px] text-left text-[12px]">
          <thead className="text-[10px] uppercase text-slate-500">
            <tr>
              <th className="py-1 pr-2">Problem</th>
              <th className="py-1 pr-2">Lang</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2">Score</th>
              <th className="py-1 pr-2">Passed</th>
              <th className="py-1 pr-2">Runtime</th>
              <th className="py-1">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.id} className="border-t border-white/[0.05] text-slate-300">
                <td className="py-1.5 pr-2">{h.problemTitle}</td>
                <td className="py-1.5 pr-2">{h.language}</td>
                <td className="py-1.5 pr-2">{h.status}</td>
                <td className="py-1.5 pr-2 tabular-nums">{h.scorePercent}%</td>
                <td className="py-1.5 pr-2 tabular-nums">
                  {h.passed}/{h.total}
                </td>
                <td className="py-1.5 pr-2 tabular-nums">
                  {h.runtimeMs != null ? `${h.runtimeMs} ms` : '—'}
                </td>
                <td className="py-1.5">{new Date(h.submittedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/contests" className="ex-btn-primary">
          Back to Contests
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
