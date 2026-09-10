'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProctorConsentGate } from '@/components/proctor/proctor-consent-gate';

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
  const params = useParams();
  const router = useRouter();
  const examId = String(params.examId ?? '');
  const [detail, setDetail] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProctor, setShowProctor] = useState(false);

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

  const enterLab = async () => {
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
        router.replace(`/open-coding/${examId}/result`);
        return;
      }
      router.replace(`/open-coding/${examId}/lab`);
    } catch {
      setError('Could not start challenge');
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#070b14] px-4 text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#070b14] text-sm text-slate-400">
        Loading challenge…
      </div>
    );
  }

  const submitted = detail.attempt?.status === 'submitted';
  const inProgress = Boolean(detail.attempt && !submitted);

  if (showProctor && !submitted) {
    return (
      <div className="min-h-[100dvh] bg-[#070b14] px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-lg">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
            Open-link hard coding · Proctored
          </p>
          <h1 className="mt-2 text-xl font-semibold text-white">{detail.exam.title}</h1>
          <div className="mt-6">
            <ProctorConsentGate
              onReady={() => void enterLab()}
              onCancel={() => setShowProctor(false)}
            />
          </div>
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
          {busy ? <p className="mt-2 text-sm text-slate-400">Starting Code Lab…</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#070b14] px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-lg border border-white/[0.08] bg-[#0c1424] p-5 sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
            Open-link exam only · Challenge + Code Lab
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{detail.exam.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {detail.exam.description ||
              'Hard coding open-link exam. Portal pages (DSA Arena, Contests, Home) stay locked until you finish.'}
          </p>

          <div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-3">
            <p>
              <span className="text-slate-500">Timer</span>
              <br />
              {detail.exam.durationMinutes} minutes
            </p>
            <p>
              <span className="text-slate-500">Problems</span>
              <br />
              {detail.exam.problemCount} coding · Java / Python
            </p>
            <p>
              <span className="text-slate-500">After finish</span>
              <br />
              Submit &amp; leave (no student scorecard)
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Rules
              </h2>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-300">
                {detail.instructions}
              </pre>
              <p className="mt-3 text-[12px] text-amber-100/90">
                Camera + fullscreen proctoring (ElevateX style). Tab switches are flagged. After the
                limit, the exam auto-submits.
              </p>
            </div>
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Questions
              </h2>
              {detail.problems.length === 0 ? (
                <p className="mt-2 text-[13px] text-slate-400">
                  5 hard problems are assigned when you start. Each shows statement, constraints,
                  samples, and explanation in Code Lab.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.problems.map((p) => (
                    <li
                      key={p.position}
                      className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                    >
                      <p className="text-[13px] font-semibold text-white">
                        Q{p.position}. {p.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {p.difficulty}
                        {p.category ? ` · ${p.category}` : ''} · {p.points} pts
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

          <div className="mt-6">
            {submitted ? (
              <div className="space-y-3">
                <p className="text-sm text-emerald-200/90">
                  This exam is already submitted. Scores are visible to administrators only.
                </p>
                <button
                  type="button"
                  className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
                  onClick={() => router.replace(`/open-coding/${examId}/result`)}
                >
                  Exit exam
                </button>
              </div>
            ) : inProgress ? (
              <button
                type="button"
                className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                disabled={busy}
                onClick={() => setShowProctor(true)}
              >
                Continue Code Lab
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                disabled={busy}
                onClick={() => setShowProctor(true)}
              >
                Start Challenge
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
