'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ElevateXScorecardView } from '@/components/placement/elevatex-scorecard-view';
import type { PlacementScorecard } from '@/lib/placement/types';
import { DEFAULT_EXAM_STUDENT_PASSWORD } from '@/lib/roster-credentials-export';

type ExamRow = {
  id: string;
  title: string;
  duration: number;
  status: string;
  openLinkPath: string | null;
  openLinkPassword: string;
  joinCount: number;
  createdAt: string;
};

type AttemptRow = {
  id: string;
  status: string;
  totalScore: number;
  maxScore: number;
  solvedCount: number;
  percentage: number;
  startedAt: string;
  submittedAt: string | null;
  fullName: string | null;
  rollNumber: string | null;
  scorecard: PlacementScorecard | null;
};

export default function AdminDsaHardOpenPage() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [scorecard, setScorecard] = useState<PlacementScorecard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    title: string;
    openLinkPath: string;
    openLinkPassword: string;
    problemPoolSize: number;
  } | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  const loadExams = useCallback(async () => {
    const res = await fetch('/api/admin/dsa/hard-open', { credentials: 'include', cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load exams');
      return;
    }
    setExams(json.exams ?? []);
  }, []);

  const loadAttempts = useCallback(async (examId: string) => {
    const res = await fetch(`/api/admin/dsa/hard-open/${encodeURIComponent(examId)}/attempts`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load attempts');
      return;
    }
    setAttempts(json.attempts ?? []);
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (selectedId) void loadAttempts(selectedId);
  }, [selectedId, loadAttempts]);

  const createExam = async () => {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch('/api/admin/dsa/hard-open', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationMinutes: 60,
          password: DEFAULT_EXAM_STUDENT_PASSWORD,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Create failed');
      setCreated({
        title: json.title,
        openLinkPath: json.openLinkPath,
        openLinkPassword: json.openLinkPassword,
        problemPoolSize: json.problemPoolSize,
      });
      setSelectedId(json.examId);
      await loadExams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const selected = exams.find((e) => e.id === selectedId) ?? null;
  const openUrl =
    selected?.openLinkPath && origin ? `${origin}${selected.openLinkPath}` : selected?.openLinkPath;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            DSA Contests · Open link
          </p>
          <h1 className="text-2xl font-bold text-[#0c2340]">Hard Coding Open Link</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Creates a named open-link exam with a random title. Students (IV Year only) join with roll
            number, then get 5 jumbled Java/Python problems from the contest bank (~50 questions) in
            the same Code Lab as DSA practice. Full ElevateX-style results show immediately on finish.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/dsa-arena/contests"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Contests
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createExam()}
            className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create hard open link'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {created ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <p className="font-semibold">Published: {created.title}</p>
          <p className="mt-1">
            Open link:{' '}
            <a className="font-mono underline" href={created.openLinkPath}>
              {origin}
              {created.openLinkPath}
            </a>
          </p>
          <p className="mt-1">
            Password: <span className="font-mono">{created.openLinkPassword}</span> · Bank pool:{' '}
            {created.problemPoolSize} problems · Draw: 5 · Year: IV Year only
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Open coding exams</h2>
          <ul className="mt-3 space-y-2">
            {exams.length === 0 ? (
              <li className="text-sm text-slate-500">No hard open-link exams yet.</li>
            ) : (
              exams.map((exam) => (
                <li key={exam.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(exam.id);
                      setScorecard(null);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selectedId === exam.id
                        ? 'border-[#1e3a5f] bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{exam.title}</p>
                    <p className="text-xs text-slate-500">
                      {exam.duration} min · {exam.joinCount} joins · {exam.status}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selected ? (
            <p className="text-sm text-slate-500">Select an exam to view the open link and student results.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{selected.title}</h2>
                <p className="mt-1 break-all text-sm text-slate-600">
                  Open link:{' '}
                  {openUrl ? (
                    <a className="font-mono text-[#1e3a5f] underline" href={selected.openLinkPath ?? '#'}>
                      {openUrl}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Password: <span className="font-mono">{selected.openLinkPassword}</span>
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Student attempts
                </h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Roll</th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Score</th>
                        <th className="py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-slate-500">
                            No attempts yet.
                          </td>
                        </tr>
                      ) : (
                        attempts.map((a) => (
                          <tr key={a.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-mono text-xs">{a.rollNumber ?? '—'}</td>
                            <td className="py-2 pr-3">{a.fullName ?? '—'}</td>
                            <td className="py-2 pr-3">{a.status}</td>
                            <td className="py-2 pr-3 tabular-nums">
                              {a.totalScore}/{a.maxScore} ({a.percentage}%)
                            </td>
                            <td className="py-2">
                              {a.scorecard ? (
                                <button
                                  type="button"
                                  className="text-[#1e3a5f] underline"
                                  onClick={() => setScorecard(a.scorecard)}
                                >
                                  View scorecard
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {scorecard ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <ElevateXScorecardView scorecard={scorecard} compact />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
