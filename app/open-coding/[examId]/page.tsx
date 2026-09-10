'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ContestsPortalFrame } from '@/components/student/portal/contests/contests-portal-frame';

type Brief = {
  exam: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    totalMarks: number;
    problemCount: number;
  };
  attempt: {
    id: string;
    status: string;
    totalScore: number;
    maxScore: number;
    solvedCount: number;
  } | null;
  problems: Array<{
    position: number;
    title: string;
    difficulty: string;
    category: string | null;
    tags: string[];
    points: number;
    progress?: string;
  }>;
  instructions: string;
};

export default function OpenCodingBriefPage() {
  return (
    <ContestsPortalFrame title="HARD CODING" subtitle="Challenge brief">
      <BriefBody />
    </ContestsPortalFrame>
  );
}

function BriefBody() {
  const params = useParams();
  const router = useRouter();
  const examId = String(params.examId ?? '');
  const [detail, setDetail] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to load challenge');
          return;
        }
        setDetail(data as Brief);
      } catch {
        setError('Failed to load challenge');
      }
    };
    void load();
  }, [examId]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start challenge');
        return;
      }
      if (data.completed) {
        router.push(`/open-coding/${examId}/result`);
        return;
      }
      router.push(`/open-coding/${examId}/lab`);
    } catch {
      setError('Could not start challenge');
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <Link href="/dashboard" className="ex-btn-ghost">
          ← Student dashboard
        </Link>
      </div>
    );
  }

  if (!detail) {
    return <p className="text-sm text-slate-400">Loading challenge brief…</p>;
  }

  const submitted = detail.attempt?.status === 'submitted';
  const inProgress = Boolean(detail.attempt && !submitted);

  const primary = submitted
    ? {
        label: 'View ElevateX Result',
        action: () => router.push(`/open-coding/${examId}/result`),
      }
    : inProgress
      ? {
          label: 'Continue Challenge',
          action: () => router.push(`/open-coding/${examId}/lab`),
        }
      : {
          label: 'Start Challenge',
          action: () => void start(),
        };

  return (
    <div className="space-y-3 pb-4">
      <p className="text-[12px] font-semibold text-cyan-300/90">IV Year · Hard coding open link</p>

      <article className="ex-panel rounded-lg p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
              Coding Challenge · Same Code Lab as DSA practice
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">{detail.exam.title}</h1>
          </div>
          <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
            {detail.exam.problemCount} Problems
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-slate-300">
          {detail.exam.description ||
            'Hard coding sprint from the campus Java/Python contest bank. Five jumbled problems. Full ElevateX scorecard on finish.'}
        </p>

        <div className="mt-4 grid gap-2 text-[12px] text-slate-400 sm:grid-cols-3">
          <p>
            <span className="text-slate-500">Duration</span>
            <br />
            {detail.exam.durationMinutes} minutes
          </p>
          <p>
            <span className="text-slate-500">Marks</span>
            <br />
            {detail.exam.totalMarks} total
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
              How it works
            </h3>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-300">
              {detail.instructions}
            </pre>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Problems
            </h3>
            {detail.problems.length === 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                Five hard coding problems will be assigned and jumbled when you start the challenge.
                Each problem includes statement, constraints, samples, and explanation — same layout
                as DSA practice Code Lab.
              </p>
            ) : (
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
                      {p.progress ? ` · ${p.progress.replace('_', ' ')}` : ''}
                      {` · ${p.points} pts`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="ex-btn-primary"
            disabled={busy}
            onClick={() => void primary.action()}
          >
            {busy ? 'Please wait…' : primary.label}
          </button>
          <Link href="/dashboard" className="ex-btn-ghost">
            Back to dashboard
          </Link>
        </div>
      </article>
    </div>
  );
}
