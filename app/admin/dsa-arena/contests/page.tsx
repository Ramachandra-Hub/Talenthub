'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DsaContestTournamentDashboard } from '@/components/admin/dsa-contest-tournament-dashboard';
import { DsaContestAnalyticsModal } from '@/components/admin/dsa-contest-analytics-modal';
import {
  DsaContestStudentReportModal,
  type ContestStudentReport,
} from '@/components/admin/dsa-contest-student-report-modal';
import { buildContestAnalyticsExportWorkbook } from '@/lib/dsa/contest/contest-analytics-export';
import { downloadXlsxWorkbook } from '@/lib/reports/xlsx-workbook';

type ContestRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  isPublished: boolean;
  problemCount: number;
  attemptCount: number;
  submissionCount: number;
  problems?: Array<{ position: number; title: string }>;
};

type BankProblem = {
  id: string;
  title: string;
  difficulty: string;
  category: string | null;
  tags: string[];
};

type ProblemResult = {
  position: number;
  problemId: string;
  title: string;
  difficulty: string;
  status: 'solved' | 'failed' | 'not_attempted' | string;
  scorePercent: number;
  language: string | null;
  submissionCount: number;
};

type StudentRow = {
  rank: number;
  attemptId: string;
  userId: string;
  name: string | null;
  rollNumber: string | null;
  email?: string | null;
  department: string | null;
  academicYear: string | null;
  status: string;
  solvedCount: number;
  attemptedCount: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  javaAttempts: number;
  pythonAttempts: number;
  submissionCount: number;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  problemResults: ProblemResult[];
};

type ContestSummary = {
  contestId: string;
  title: string;
  status: string;
  problemCount: number;
  totalParticipants: number;
  completedAttempts: number;
  totalSubmissions: number;
  averageScorePercent: number;
  averageCompletionSeconds: number | null;
};

type StudentReport = ContestStudentReport;

export default function AdminDsaContestsPage() {
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [bank, setBank] = useState<BankProblem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const [summary, setSummary] = useState<ContestSummary | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [problems, setProblems] = useState<Record<string, unknown>[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [tournamentTick, setTournamentTick] = useState(0);

  const reload = useCallback(async () => {
    const [cRes, bRes] = await Promise.all([
      fetch('/api/admin/dsa/contests', { credentials: 'include' }),
      fetch('/api/admin/dsa/contests?view=bank', { credentials: 'include' }),
    ]);
    if (!cRes.ok) {
      setError('Failed to load admin contest data');
      return;
    }
    const cJson = await cRes.json();
    setContests(cJson.contests ?? []);
    if (bRes.ok) {
      const bJson = await bRes.json();
      setBank(bJson.problems ?? []);
    }
    setTournamentTick((t) => t + 1);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openContest = async (contest: ContestRow) => {
    setSelected(contest.id);
    setSelectedTitle(contest.title);
    setSummary(null);
    setStudents([]);
    setProblems([]);
    setSubmissions([]);
    setAnalyticsLoading(true);
    setError(null);
    try {
      const [sumRes, sRes, pRes, subRes] = await Promise.all([
        fetch(`/api/admin/dsa/contests/${contest.id}/analytics?view=summary`, {
          credentials: 'include',
        }),
        fetch(`/api/admin/dsa/contests/${contest.id}/analytics?view=students`, {
          credentials: 'include',
        }),
        fetch(`/api/admin/dsa/contests/${contest.id}/analytics?view=problems`, {
          credentials: 'include',
        }),
        fetch(`/api/admin/dsa/contests/${contest.id}/analytics?view=submissions`, {
          credentials: 'include',
        }),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (sRes.ok) setStudents((await sRes.json()).students ?? []);
      if (pRes.ok) setProblems((await pRes.json()).problems ?? []);
      if (subRes.ok) setSubmissions((await subRes.json()).submissions ?? []);
      if (!sRes.ok) setError('Failed to load student analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const closeAnalytics = () => {
    setSelected(null);
    setSelectedTitle('');
    setSummary(null);
    setStudents([]);
    setProblems([]);
    setSubmissions([]);
    setAnalyticsLoading(false);
  };

  const openStudentReport = async (attemptId: string) => {
    if (!selected) return;
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    try {
      const res = await fetch(
        `/api/admin/dsa/contests/${selected}/analytics?view=report&attemptId=${encodeURIComponent(attemptId)}`,
        { credentials: 'include' },
      );
      const json = await res.json();
      if (!res.ok) {
        setReportError(json.error ?? 'Failed to load student report');
        return;
      }
      setReport(json.report as StudentReport);
    } finally {
      setReportLoading(false);
    }
  };

  const togglePick = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const createContest = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/dsa/contests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `DSA Arena Coding Challenge Draft`,
          durationMinutes: 60,
          problemIds: picked,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Create failed');
        return;
      }
      setMessage(`Created draft contest ${json.contest?.slug ?? ''}`);
      setTitle('');
      setPicked([]);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const patchContest = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/dsa/contests/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Update failed');
        return;
      }
      setMessage(`Updated ${json.contest?.title ?? id}`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const bankByCategory = useMemo(() => {
    const map = new Map<string, BankProblem[]>();
    for (const p of bank) {
      const key = p.category || 'Uncategorized';
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [bank]);

  const exportContestExcel = async () => {
    if (!students.length) return;
    const workbook = buildContestAnalyticsExportWorkbook(selectedTitle, students);
    await downloadXlsxWorkbook(workbook);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              DSA Arena
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">Coding Contests</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage contests and review student results with ElevateX-style feedback reports.
            </p>
          </div>
          <Link
            href="/admin/dsa-arena/hard-open"
            className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white"
          >
            Hard Coding Open Link
          </Link>
        </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <DsaContestTournamentDashboard
        key={tournamentTick}
        onOpenContestAnalytics={(contestId, title) => {
          const row = contests.find((c) => c.id === contestId);
          void openContest(
            row ?? {
              id: contestId,
              slug: '',
              title,
              status: 'published',
              isPublished: true,
              problemCount: 0,
              attemptCount: 0,
              submissionCount: 0,
            },
          );
        }}
      />

      <section className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Create contest</h2>
        <p className="text-xs text-slate-500">
          Question bank loaded: {bank.length} problems. Select up to 3 for a draft (exactly 3 to
          publish).
        </p>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Contest title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto rounded border p-2 text-xs space-y-3">
          {bankByCategory.map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-1 font-semibold text-slate-600">{cat}</p>
              <div className="space-y-1">
                {items.map((p) => {
                  const checked = picked.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && picked.length >= 3}
                        onChange={() => togglePick(p.id)}
                      />
                      <span>
                        <span className="font-medium text-slate-800">{p.title}</span>
                        <span className="text-slate-500">
                          {' '}
                          · {p.difficulty}
                          {p.tags.length ? ` · ${p.tags.slice(0, 3).join(', ')}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {!bank.length ? (
            <p className="text-slate-500">
              No bank problems yet. Run `pnpm run import:dsa-contests` first.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-slate-600">Selected: {picked.length} / 3</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createContest()}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create draft contest
        </button>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Contest list</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Title</th>
                <th>Status</th>
                <th>Problems</th>
                <th>Attempts</th>
                <th>Subs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="py-2 font-medium">
                    {c.title}
                    <div className="text-[11px] font-normal text-slate-500">{c.slug}</div>
                  </td>
                  <td>
                    {c.status}
                    {c.isPublished ? ' · published' : ''}
                  </td>
                  <td>
                    {c.problemCount}
                    {c.problems?.length ? (
                      <ul className="mt-1 text-[11px] text-slate-500">
                        {c.problems.map((p) => (
                          <li key={p.position}>
                            {p.position}. {p.title}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td>{c.attemptCount}</td>
                  <td>{c.submissionCount}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="font-semibold text-cyan-700 hover:underline"
                      onClick={() => void openContest(c)}
                    >
                      Analytics
                    </button>
                    <button
                      type="button"
                      disabled={busy || c.problemCount !== 3}
                      className="text-emerald-700 hover:underline disabled:opacity-40"
                      onClick={() => void patchContest(c.id, { action: 'activate' })}
                    >
                      Publish/Activate
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-amber-700 hover:underline disabled:opacity-40"
                      onClick={() => void patchContest(c.id, { action: 'unpublish' })}
                    >
                      Unpublish
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-rose-700 hover:underline disabled:opacity-40"
                      onClick={() => void patchContest(c.id, { action: 'end' })}
                    >
                      End
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/admin/dashboard" className="text-sm text-cyan-700 hover:underline">
        ← Admin dashboard
      </Link>

      <DsaContestAnalyticsModal
        open={Boolean(selected)}
        onClose={closeAnalytics}
        title={selectedTitle}
        loading={analyticsLoading}
        summary={summary}
        students={students}
        problems={problems}
        submissions={submissions}
        onOpenStudentReport={(attemptId) => void openStudentReport(attemptId)}
        onExportExcel={() => void exportContestExcel()}
      />

      <DsaContestStudentReportModal
        open={reportLoading || Boolean(report) || Boolean(reportError)}
        loading={reportLoading}
        error={reportError}
        report={report}
        onClose={() => {
          setReport(null);
          setReportError(null);
          setReportLoading(false);
        }}
      />

    </div>
  );
}

