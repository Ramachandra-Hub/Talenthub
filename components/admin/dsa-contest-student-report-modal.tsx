'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Code2,
  Lightbulb,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import {
  ReportBarCard,
  ReportChartGrid,
  ReportDonutCard,
} from '@/components/admin/admin-report-charts';
import { Button } from '@/components/ui/button';
import { COLLEGE } from '@/lib/college-brand';
import { cn } from '@/lib/utils';

export type ContestStudentReport = {
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
    problemId?: string;
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

type TabId = 'overview' | 'problems' | 'code' | 'timeline';

function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function statusBadge(status: string) {
  const base = 'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide';
  if (status === 'solved' || status === 'submitted' || status === 'passed') {
    return `${base} bg-emerald-100 text-emerald-800`;
  }
  if (status === 'failed' || status === 'expired') {
    return `${base} bg-rose-100 text-rose-800`;
  }
  if (status === 'in_progress' || status === 'not_attempted') {
    return `${base} bg-amber-100 text-amber-800`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}

function ScoreRing({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  const color = p >= 80 ? '#34d399' : p >= 50 ? '#38bdf8' : p >= 33 ? '#fbbf24' : '#fb7185';

  return (
    <div className="relative h-[120px] w-[120px]">
      <svg viewBox="0 0 108 108" className="h-full w-full -rotate-90">
        <circle cx="54" cy="54" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black tabular-nums text-white">{Math.round(p)}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">%</span>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  report: ContestStudentReport | null;
  onClose: () => void;
};

export function DsaContestStudentReportModal({
  open,
  loading,
  error,
  report,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setTab('overview');
  }, [open, report?.attempt.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const problemScoreBars = useMemo(() => {
    if (!report) return [];
    return report.problems.map((p) => ({
      label: `P${p.position}: ${p.title}`,
      shortLabel: `P${p.position}`,
      value: Math.round(p.scorePercent),
      hint: `${p.status} · ${p.difficulty}`,
    }));
  }, [report]);

  const solvePie = useMemo(() => {
    if (!report) return [];
    const solved = report.problems.filter((p) => p.status === 'solved').length;
    const failed = report.problems.filter((p) => p.status === 'failed').length;
    const skipped = report.problems.filter((p) => p.status === 'not_attempted').length;
    return [
      { name: 'solved', label: 'Solved', value: solved },
      { name: 'failed', label: 'Failed', value: failed },
      { name: 'skipped', label: 'Not attempted', value: skipped },
    ];
  }, [report]);

  const languagePie = useMemo(() => {
    if (!report) return [];
    return [
      { name: 'java', label: 'Java', value: report.languageSummary.java },
      { name: 'python', label: 'Python', value: report.languageSummary.python },
    ];
  }, [report]);

  const progressBars = useMemo(() => {
    if (!report) return [];
    // Chronological best score progress by submission order (oldest → newest)
    const chrono = [...report.history].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
    if (!chrono.length) return [];
    const bestByProblem = new Map<string, number>();
    const points: Array<{ label: string; shortLabel: string; value: number; hint: string }> = [];
    chrono.forEach((h, i) => {
      const prev = bestByProblem.get(h.problemTitle) ?? 0;
      bestByProblem.set(h.problemTitle, Math.max(prev, h.scorePercent));
      const avg =
        [...bestByProblem.values()].reduce((s, v) => s + v, 0) / Math.max(1, bestByProblem.size);
      points.push({
        label: `Submit ${i + 1}`,
        shortLabel: `#${i + 1}`,
        value: Math.round(avg),
        hint: `${h.problemTitle} · ${h.language} · ${h.scorePercent}%`,
      });
    });
    return points.slice(-12);
  }, [report]);

  const attemptBars = useMemo(() => {
    if (!report) return [];
    return report.problems.map((p) => ({
      label: `P${p.position}`,
      shortLabel: `P${p.position}`,
      value: p.submissionCount,
      hint: `${p.title} · ${p.submissionCount} submissions`,
    }));
  }, [report]);

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[230] overflow-y-auto overscroll-contain animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dsa-student-report-title"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-[#050a12]/80 backdrop-blur-md"
        aria-label="Close student report"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-3 sm:p-5">
        <div
          className="relative z-[1] my-auto flex h-[min(calc(100dvh-1.5rem),960px)] w-full max-w-[min(1100px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.5rem] border border-cyan-400/25 bg-[#f4f7fb] shadow-[0_40px_100px_-20px_rgba(5,10,18,0.7)]"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="relative shrink-0 overflow-hidden px-5 pb-7 pt-6 text-white sm:px-7">
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#12304f] to-[#0b3d4a]"
              aria-hidden
            />
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 80% 70% at 0% 0%, rgba(34,211,238,0.28), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 20%, rgba(52,211,153,0.18), transparent 50%), radial-gradient(ellipse 50% 40% at 70% 100%, rgba(251,191,36,0.16), transparent 45%)',
              }}
              aria-hidden
            />
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />

            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <ScoreRing percent={report?.attempt.percentage ?? 0} />
                <div className="min-w-0 pt-1">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-200/90">
                    <Trophy className="h-3.5 w-3.5" aria-hidden />
                    Full contest report
                  </p>
                  <h2
                    id="dsa-student-report-title"
                    className="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl"
                  >
                    {report?.student.name ||
                      (loading ? 'Loading report…' : error ? 'Report unavailable' : 'Student')}
                  </h2>
                  <p className="mt-1 truncate text-sm text-white/75">
                    {report?.student.rollNumber || '—'}
                    {report?.contest.title ? ` · ${report.contest.title}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {report ? (
                      <>
                        <span className={statusBadge(report.attempt.status)}>
                          {report.attempt.status}
                        </span>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80">
                          {report.attempt.solvedCount}/
                          {report.problems.length || 3} solved
                        </span>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80">
                          {formatDuration(report.attempt.durationSeconds)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-start gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl border-white/25 bg-white/10 text-white hover:bg-white/20"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {report ? (
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:grid-cols-4 sm:gap-3 sm:px-6">
              {[
                {
                  label: 'Exam score',
                  value: `${report.attempt.percentage}%`,
                  tone: 'bg-[#0c2340] text-white',
                  icon: Target,
                },
                {
                  label: 'Marks',
                  value: `${report.attempt.totalScore}/${report.attempt.maxScore}`,
                  tone: 'bg-emerald-600 text-white',
                  icon: Trophy,
                },
                {
                  label: 'Coding attempts',
                  value: report.history.length,
                  tone: 'bg-cyan-700 text-white',
                  icon: Code2,
                },
                {
                  label: 'Time in exam',
                  value: formatDuration(report.attempt.durationSeconds),
                  tone: 'bg-amber-500 text-white',
                  icon: Zap,
                },
              ].map((kpi) => (
                <div key={kpi.label} className={cn('rounded-xl px-3 py-2.5 shadow-sm', kpi.tone)}>
                  <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-85">
                    <kpi.icon className="h-3 w-3" aria-hidden />
                    {kpi.label}
                  </p>
                  <p className="mt-0.5 text-xl font-black tabular-nums">{kpi.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            {(
              [
                ['overview', 'Charts & progress'],
                ['problems', 'Challenges'],
                ['code', 'Best code'],
                ['timeline', 'Submission timeline'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                disabled={!report && !loading}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40',
                  tab === id
                    ? 'bg-[#0c2340] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            {loading ? (
              <p className="py-20 text-center text-sm text-slate-500 animate-pulse">
                Building student charts and report…
              </p>
            ) : error ? (
              <p className="py-20 text-center text-sm text-rose-600">{error}</p>
            ) : !report ? null : tab === 'overview' ? (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Candidate
                    </p>
                    <p className="mt-1 text-base font-bold text-[#0c2340]">
                      {report.student.name || '—'}
                    </p>
                    <p className="text-sm text-slate-600">{report.student.email || '—'}</p>
                    <p className="text-sm text-slate-600">
                      {[
                        report.student.department,
                        report.student.academicYear,
                        report.student.college,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Exam window
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      Started: <strong>{formatIst(report.attempt.startedAt)}</strong>
                    </p>
                    <p className="text-sm text-slate-700">
                      Submitted: <strong>{formatIst(report.attempt.submittedAt)}</strong>
                    </p>
                    <p className="text-sm text-slate-700">
                      Languages: Java <strong>{report.languageSummary.java}</strong> · Python{' '}
                      <strong>{report.languageSummary.python}</strong>
                    </p>
                  </div>
                </div>

                <ReportChartGrid>
                  <ReportDonutCard
                    title="Challenge outcomes"
                    hint="Solved vs failed vs skipped in this exam"
                    data={solvePie}
                    colors={['#10b981', '#f43f5e', '#94a3b8']}
                  />
                  <ReportBarCard
                    title="Score by challenge"
                    hint="Best score % on each contest problem"
                    data={problemScoreBars}
                    primaryColor="#0e7490"
                  />
                  <ReportDonutCard
                    title="Coding language mix"
                    hint="Submission volume by language"
                    data={languagePie}
                    colors={['#38bdf8', '#f59e0b']}
                  />
                  <ReportBarCard
                    title="Coding effort by problem"
                    hint="How many times they submitted each challenge"
                    data={attemptBars}
                    primaryColor="#1e3a5f"
                  />
                </ReportChartGrid>

                {progressBars.length > 0 ? (
                  <ReportBarCard
                    title="Progress during the exam"
                    hint="Average best-so-far score after each coding submission"
                    data={progressBars}
                    primaryColor="#059669"
                  />
                ) : null}

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                      <Trophy className="h-3.5 w-3.5" aria-hidden />
                      Strengths
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-emerald-900">
                      {report.feedback.strengths.length ? (
                        report.feedback.strengths.map((s) => <li key={s}>• {s}</li>)
                      ) : (
                        <li className="text-emerald-800/70">No fully solved challenges yet.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">
                      <Target className="h-3.5 w-3.5" aria-hidden />
                      Gaps
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-rose-900">
                      {report.feedback.gaps.length ? (
                        report.feedback.gaps.map((g) => <li key={g}>• {g}</li>)
                      ) : (
                        <li className="text-rose-800/70">No gaps — clean sweep.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                      Recommendation
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-amber-950">
                      {report.feedback.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            ) : tab === 'problems' ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3">#</th>
                        <th className="px-3 py-3">Challenge</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Score</th>
                        <th className="px-3 py-3">Tests</th>
                        <th className="px-3 py-3">Lang</th>
                        <th className="px-3 py-3">Compile</th>
                        <th className="px-3 py-3">Subs</th>
                        <th className="px-3 py-3">Runtime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.problems.map((p) => (
                        <tr
                          key={p.problemId || p.position}
                          className="border-t border-slate-100 align-top hover:bg-slate-50/90"
                        >
                          <td className="px-3 py-3 tabular-nums text-slate-500">{p.position}</td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-[#0c2340]">{p.title}</p>
                            <p className="text-xs text-slate-500">
                              {p.difficulty}
                              {p.category ? ` · ${p.category}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <span className={statusBadge(p.status)}>{p.status}</span>
                            {p.failureType ? (
                              <p className="mt-1 text-[10px] text-slate-500">{p.failureType}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 font-semibold tabular-nums">
                            {p.scorePercent}%
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-600">
                            {p.passed}/{p.total}
                          </td>
                          <td className="px-3 py-3">{p.language || '—'}</td>
                          <td className="px-3 py-3">
                            {p.compileOk == null ? '—' : p.compileOk ? 'OK' : 'Fail'}
                          </td>
                          <td className="px-3 py-3 tabular-nums">{p.submissionCount}</td>
                          <td className="px-3 py-3 tabular-nums">
                            {p.runtimeMs != null ? `${p.runtimeMs} ms` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : tab === 'code' ? (
              <div className="space-y-3">
                {report.problems.filter((p) => p.bestSourceCode).length === 0 ? (
                  <p className="py-16 text-center text-sm text-slate-500">No submissions yet.</p>
                ) : (
                  report.problems
                    .filter((p) => p.bestSourceCode)
                    .map((p) => (
                      <details
                        key={p.problemId || p.position}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                        open={p.status === 'failed' || p.status === 'solved'}
                      >
                        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#0c2340] hover:bg-slate-50">
                          Challenge {p.position}: {p.title} · {p.language || 'code'} ·{' '}
                          {p.scorePercent}%
                        </summary>
                        <pre className="max-h-72 overflow-auto border-t border-slate-100 bg-[#0b1220] p-4 text-[11px] leading-relaxed text-slate-100">
                          {p.bestSourceCode}
                        </pre>
                      </details>
                    ))
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3">When (IST)</th>
                        <th className="px-3 py-3">Challenge</th>
                        <th className="px-3 py-3">Lang</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Score</th>
                        <th className="px-3 py-3">Tests</th>
                        <th className="px-3 py-3">Runtime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.history.map((h) => (
                        <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/90">
                          <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                            {formatIst(h.submittedAt)}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-[#0c2340]">
                            {h.problemTitle}
                          </td>
                          <td className="px-3 py-2.5">{h.language}</td>
                          <td className="px-3 py-2.5">
                            <span className={statusBadge(h.status)}>{h.status}</span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-semibold">
                            {h.scorePercent}%
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">
                            {h.passed}/{h.total}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {h.runtimeMs != null ? `${h.runtimeMs} ms` : '—'}
                          </td>
                        </tr>
                      ))}
                      {!report.history.length ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-12 text-center text-slate-500">
                            No coding submissions recorded.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 text-center text-xs text-slate-500 sm:px-6">
            {COLLEGE.shortName} · DSA Contest student intel ·{' '}
            {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
