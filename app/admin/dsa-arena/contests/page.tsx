'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppModal, AppModalPanel } from '@/components/ui/app-modal';

type Overview = {
  totalContests: number;
  publishedContests: number;
  studentsParticipated: number;
  totalSubmissions: number;
  totalProblemsSolved: number;
  averageScorePercent: number;
  averageRuntimeMs: number | null;
  javaAttempts: number;
  pythonAttempts: number;
  javaSuccessRate: number;
  pythonSuccessRate: number;
};

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

type StudentReport = {
  contest: { title: string; slug: string; durationMinutes: number };
  student: {
    name: string | null;
    rollNumber: string | null;
    email: string | null;
    department: string | null;
    academicYear: string | null;
    college: string | null;
  };
  attempt: {
    id: string;
    status: string;
    totalScore: number;
    maxScore: number;
    percentage: number;
    solvedCount: number;
    attemptedCount: number;
    startedAt: string;
    submittedAt: string | null;
    durationSeconds: number | null;
  };
  problems: Array<{
    position: number;
    title: string;
    difficulty: string;
    category: string | null;
    status: string;
    scorePercent: number;
    language: string | null;
    passed: number;
    total: number;
    compileOk: boolean | null;
    failureType: string | null;
    runtimeMs: number | null;
    submissionCount: number;
    bestSourceCode: string | null;
  }>;
  history: Array<{
    id: string;
    problemTitle: string;
    language: string;
    status: string;
    scorePercent: number;
    passed: number;
    total: number;
    compileOk: boolean | null;
    failureType: string | null;
    runtimeMs: number | null;
    sourceCode: string;
    submittedAt: string;
  }>;
  feedback: {
    strengths: string[];
    gaps: string[];
    recommendation: string;
  };
  languageSummary: { java: number; python: number };
};

function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusBadge(status: string) {
  const base = 'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase';
  if (status === 'solved' || status === 'submitted' || status === 'passed') {
    return `${base} bg-emerald-50 text-emerald-700`;
  }
  if (status === 'failed' || status === 'expired') {
    return `${base} bg-rose-50 text-rose-700`;
  }
  if (status === 'in_progress') {
    return `${base} bg-amber-50 text-amber-700`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}

export default function AdminDsaContestsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
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

  const reload = useCallback(async () => {
    const [oRes, cRes, bRes] = await Promise.all([
      fetch('/api/admin/dsa/contests?view=overview', { credentials: 'include' }),
      fetch('/api/admin/dsa/contests', { credentials: 'include' }),
      fetch('/api/admin/dsa/contests?view=bank', { credentials: 'include' }),
    ]);
    if (!oRes.ok || !cRes.ok) {
      setError('Failed to load admin contest data');
      return;
    }
    setOverview(await oRes.json());
    const cJson = await cRes.json();
    setContests(cJson.contests ?? []);
    if (bRes.ok) {
      const bJson = await bRes.json();
      setBank(bJson.problems ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openContest = async (contest: ContestRow) => {
    setSelected(contest.id);
    setSelectedTitle(contest.title);
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

  const problemColumns = useMemo(() => {
    const first = students.find((s) => s.problemResults?.length);
    return first?.problemResults ?? [];
  }, [students]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          DSA Arena
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Coding Contests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage contests and review student results with ElevateX-style feedback reports.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Contests', overview.totalContests],
            ['Published', overview.publishedContests],
            ['Participants', overview.studentsParticipated],
            ['Submissions', overview.totalSubmissions],
            ['Problems solved', overview.totalProblemsSolved],
            ['Avg score %', overview.averageScorePercent],
            ['Java attempts', overview.javaAttempts],
            ['Python attempts', overview.pythonAttempts],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border bg-white p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

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

      {selected ? (
        <div className="space-y-4">
          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Student results · ElevateX-style feedback
                </p>
                <h2 className="text-lg font-semibold text-slate-900">{selectedTitle}</h2>
              </div>
              {summary ? (
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  <span>
                    Participants <strong>{summary.totalParticipants}</strong>
                  </span>
                  <span>
                    Completed <strong>{summary.completedAttempts}</strong>
                  </span>
                  <span>
                    Avg score <strong>{summary.averageScorePercent}%</strong>
                  </span>
                  <span>
                    Avg time{' '}
                    <strong>{formatDuration(summary.averageCompletionSeconds)}</strong>
                  </span>
                </div>
              ) : null}
            </div>

            {analyticsLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading student analytics…</p>
            ) : !students.length ? (
              <p className="mt-4 text-sm text-slate-500">
                No student attempts yet for this contest.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto max-h-[min(70vh,560px)]">
                <table className="w-full min-w-[980px] text-left text-xs sm:text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Roll</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Dept / Year</th>
                      <th className="px-2 py-2">Solved</th>
                      <th className="px-2 py-2">Score</th>
                      {problemColumns.map((p) => (
                        <th key={p.problemId} className="px-2 py-2">
                          P{p.position}
                        </th>
                      ))}
                      <th className="px-2 py-2">Lang</th>
                      <th className="px-2 py-2">Time</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.attemptId} className="border-t hover:bg-slate-50/80">
                        <td className="px-2 py-2 tabular-nums text-slate-500">{s.rank}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="font-semibold text-cyan-700 hover:underline"
                            onClick={() => void openStudentReport(s.attemptId)}
                          >
                            {s.rollNumber || '—'}
                          </button>
                        </td>
                        <td className="px-2 py-2 font-medium text-slate-900">
                          {s.name || '—'}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {[s.department, s.academicYear].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {s.solvedCount}/3
                        </td>
                        <td className="px-2 py-2 tabular-nums font-semibold">
                          {s.percentage}%
                          <div className="text-[10px] font-normal text-slate-500">
                            {s.totalScore}/{s.maxScore}
                          </div>
                        </td>
                        {(s.problemResults ?? []).map((p) => (
                          <td key={p.problemId} className="px-2 py-2">
                            <span className={statusBadge(p.status)}>
                              {p.status === 'solved'
                                ? '✓'
                                : p.status === 'failed'
                                  ? '✗'
                                  : '—'}
                            </span>
                          </td>
                        ))}
                        <td className="px-2 py-2 text-slate-600">
                          J{s.javaAttempts}/P{s.pythonAttempts}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatDuration(s.durationSeconds)}
                        </td>
                        <td className="px-2 py-2">
                          <span className={statusBadge(s.status)}>{s.status}</span>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-100"
                            onClick={() => void openStudentReport(s.attemptId)}
                          >
                            Full report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <Section title="Problem analytics" rows={problems} />
          <Section
            title="Submission history (source visible to admin)"
            rows={submissions.map((s) => ({
              id: s.id,
              student: s.studentName,
              roll: s.rollNumber,
              problem: s.problemTitle,
              language: s.language,
              status: s.status,
              score: s.scorePercent,
              passed: `${s.passed}/${s.total}`,
              runtimeMs: s.runtimeMs,
              submittedAt: s.submittedAt,
            }))}
          />
        </div>
      ) : null}

      <Link href="/admin/dashboard" className="text-sm text-cyan-700 hover:underline">
        ← Admin dashboard
      </Link>

      <AppModal
        open={reportLoading || Boolean(report) || Boolean(reportError)}
        onClose={() => {
          setReport(null);
          setReportError(null);
          setReportLoading(false);
        }}
      >
        <AppModalPanel maxWidthClass="max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Contest student report
              </p>
              <h3 className="text-lg font-semibold text-slate-900">
                {report?.student.name || (reportLoading ? 'Loading…' : 'Student report')}
              </h3>
              <p className="text-sm text-slate-600">
                {report?.student.rollNumber || '—'}
                {report?.contest.title ? ` · ${report.contest.title}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setReport(null);
                setReportError(null);
              }}
            >
              Close
            </button>
          </div>

          {reportLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading full report…</p>
          ) : reportError ? (
            <p className="py-8 text-center text-sm text-rose-600">{reportError}</p>
          ) : report ? (
            <div className="mt-4 max-h-[75vh] space-y-5 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Overall score" value={`${report.attempt.percentage}%`} />
                <Stat
                  label="Solved"
                  value={`${report.attempt.solvedCount} / 3`}
                />
                <Stat
                  label="Marks"
                  value={`${report.attempt.totalScore} / ${report.attempt.maxScore}`}
                />
                <Stat
                  label="Time"
                  value={formatDuration(report.attempt.durationSeconds)}
                />
              </div>

              <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500">Candidate</p>
                  <p className="mt-1 font-medium">{report.student.name || '—'}</p>
                  <p className="text-slate-600">{report.student.email || '—'}</p>
                  <p className="text-slate-600">
                    {[report.student.department, report.student.academicYear, report.student.college]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500">Attempt</p>
                  <p className="mt-1">
                    Status:{' '}
                    <span className={statusBadge(report.attempt.status)}>
                      {report.attempt.status}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Started:{' '}
                    {report.attempt.startedAt
                      ? new Date(report.attempt.startedAt).toLocaleString()
                      : '—'}
                  </p>
                  <p className="text-slate-600">
                    Submitted:{' '}
                    {report.attempt.submittedAt
                      ? new Date(report.attempt.submittedAt).toLocaleString()
                      : '—'}
                  </p>
                  <p className="text-slate-600">
                    Languages: Java {report.languageSummary.java} · Python{' '}
                    {report.languageSummary.python}
                  </p>
                </div>
              </div>

              <section>
                <h4 className="text-sm font-semibold text-slate-800">Problem breakdown</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="uppercase text-slate-500">
                      <tr>
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Problem</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1 pr-2">Score</th>
                        <th className="py-1 pr-2">Lang</th>
                        <th className="py-1 pr-2">Compile</th>
                        <th className="py-1 pr-2">Subs</th>
                        <th className="py-1 pr-2">Runtime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.problems.map((p) => (
                        <tr key={p.problemId} className="border-t align-top">
                          <td className="py-2 pr-2">{p.position}</td>
                          <td className="py-2 pr-2">
                            <div className="font-medium text-slate-900">{p.title}</div>
                            <div className="text-slate-500">
                              {p.difficulty}
                              {p.category ? ` · ${p.category}` : ''}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <span className={statusBadge(p.status)}>{p.status}</span>
                            {p.failureType ? (
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                {p.failureType}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">
                            {p.scorePercent}%
                            <div className="text-[10px] text-slate-500">
                              {p.passed}/{p.total}
                            </div>
                          </td>
                          <td className="py-2 pr-2">{p.language || '—'}</td>
                          <td className="py-2 pr-2">
                            {p.compileOk == null ? '—' : p.compileOk ? 'OK' : 'Error'}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">{p.submissionCount}</td>
                          <td className="py-2 pr-2 tabular-nums">
                            {p.runtimeMs != null ? `${p.runtimeMs} ms` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-700">Strengths</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-900">
                    {report.feedback.strengths.length ? (
                      report.feedback.strengths.map((s) => <li key={s}>{s}</li>)
                    ) : (
                      <li>No problems solved yet</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-700">Gaps</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-900">
                    {report.feedback.gaps.length ? (
                      report.feedback.gaps.map((s) => <li key={s}>{s}</li>)
                    ) : (
                      <li>None</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase text-cyan-700">
                    Recommendation
                  </p>
                  <p className="mt-2 text-sm text-cyan-950">
                    {report.feedback.recommendation}
                  </p>
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-slate-800">
                  Best submissions (admin source view)
                </h4>
                <div className="mt-2 space-y-3">
                  {report.problems
                    .filter((p) => p.bestSourceCode)
                    .map((p) => (
                      <details
                        key={p.problemId}
                        className="rounded border bg-slate-50 p-3"
                        open={p.status === 'failed'}
                      >
                        <summary className="cursor-pointer text-sm font-medium text-slate-800">
                          Problem {p.position}: {p.title} · {p.language || 'code'}
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-[#0b1220] p-3 text-[11px] leading-relaxed text-slate-100">
                          {p.bestSourceCode}
                        </pre>
                      </details>
                    ))}
                  {!report.problems.some((p) => p.bestSourceCode) ? (
                    <p className="text-sm text-slate-500">No submissions yet.</p>
                  ) : null}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-slate-800">Submission timeline</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="uppercase text-slate-500">
                      <tr>
                        <th className="py-1 pr-2">When</th>
                        <th className="py-1 pr-2">Problem</th>
                        <th className="py-1 pr-2">Lang</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1 pr-2">Score</th>
                        <th className="py-1 pr-2">Runtime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.history.map((h) => (
                        <tr key={h.id} className="border-t">
                          <td className="py-1.5 pr-2">
                            {new Date(h.submittedAt).toLocaleString()}
                          </td>
                          <td className="py-1.5 pr-2">{h.problemTitle}</td>
                          <td className="py-1.5 pr-2">{h.language}</td>
                          <td className="py-1.5 pr-2">
                            <span className={statusBadge(h.status)}>{h.status}</span>
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            {h.scorePercent}% ({h.passed}/{h.total})
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            {h.runtimeMs != null ? `${h.runtimeMs} ms` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </AppModalPanel>
      </AppModal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, unknown>[];
}) {
  if (!rows.length) {
    return (
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">No rows yet.</p>
      </section>
    );
  }
  const keys = Object.keys(rows[0]!).slice(0, 12);
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm overflow-x-auto">
      <h2 className="text-sm font-semibold">{title}</h2>
      <table className="mt-3 w-full min-w-[800px] text-left text-xs">
        <thead className="uppercase text-slate-500">
          <tr>
            {keys.map((k) => (
              <th key={k} className="py-1 pr-2">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t align-top">
              {keys.map((k) => (
                <td key={k} className="py-1.5 pr-2">
                  {formatCell(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
