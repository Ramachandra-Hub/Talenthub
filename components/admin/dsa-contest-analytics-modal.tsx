'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COLLEGE } from '@/lib/college-brand';
import { cn } from '@/lib/utils';

export type ContestAnalyticsSummary = {
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

export type ContestAnalyticsProblemResult = {
  position: number;
  problemId: string;
  title: string;
  difficulty: string;
  status: string;
  scorePercent: number;
  language: string | null;
  submissionCount: number;
};

export type ContestAnalyticsStudent = {
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
  problemResults: ContestAnalyticsProblemResult[];
};

type AnalyticsTab = 'students' | 'problems' | 'submissions';

function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusBadge(status: string) {
  const base = 'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide';
  if (status === 'solved' || status === 'submitted' || status === 'passed') {
    return `${base} bg-emerald-100 text-emerald-800`;
  }
  if (status === 'failed' || status === 'expired') {
    return `${base} bg-rose-100 text-rose-800`;
  }
  if (status === 'in_progress') {
    return `${base} bg-amber-100 text-amber-800`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

type DsaContestAnalyticsModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  loading: boolean;
  summary: ContestAnalyticsSummary | null;
  students: ContestAnalyticsStudent[];
  problems: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
  onOpenStudentReport: (attemptId: string) => void;
  onExportExcel?: () => void;
};

export function DsaContestAnalyticsModal({
  open,
  onClose,
  title,
  loading,
  summary,
  students,
  problems,
  submissions,
  onOpenStudentReport,
  onExportExcel,
}: DsaContestAnalyticsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<AnalyticsTab>('students');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setTab('students');
    setSearch('');
    setYearFilter('all');
  }, [open, title]);

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

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      const y = s.academicYear?.trim() || '—';
      set.add(y);
    }
    return ['all', ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const year = s.academicYear?.trim() || '—';
      if (yearFilter !== 'all' && year !== yearFilter) return false;
      if (!q) return true;
      return (
        (s.name ?? '').toLowerCase().includes(q) ||
        (s.rollNumber ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.department ?? '').toLowerCase().includes(q)
      );
    });
  }, [students, search, yearFilter]);

  const problemColumns = useMemo(() => {
    const first = filteredStudents.find((s) => s.problemResults?.length) ?? students.find((s) => s.problemResults?.length);
    return first?.problemResults ?? [];
  }, [filteredStudents, students]);

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[210] overflow-y-auto overscroll-contain animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dsa-contest-analytics-title"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-[#0a1628]/75 backdrop-blur-md"
        aria-label="Close analytics"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-3 sm:p-5">
        <div
          className="admin-modal-panel relative z-[1] my-auto flex h-[min(calc(100dvh-1.5rem),940px)] w-full max-w-[min(1120px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.5rem] border border-[#c4a052]/30 bg-[#f8fafc] shadow-[0_32px_80px_-12px_rgba(12,35,64,0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="relative shrink-0 overflow-hidden px-5 pb-8 pt-7 text-white sm:px-7">
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#0c2340] via-[#1e3a5f] to-[#0f4c5c]"
              aria-hidden
            />
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 90% 70% at 0% -10%, rgba(34,211,238,0.22), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(196,160,82,0.22), transparent 50%)',
              }}
              aria-hidden
            />
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c4a052] to-transparent" />

            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#e8d5a8]/90">
                  {COLLEGE.rce} · DSA Contest Analytics
                </p>
                <h2
                  id="dsa-contest-analytics-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl"
                >
                  {title || 'Contest analytics'}
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  Student scores, challenge results, and submission history
                  {summary?.status ? ` · ${summary.status}` : ''}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                <div className="min-w-[140px] rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-center backdrop-blur-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8d5a8]/90">
                    Avg score
                  </p>
                  <p className="mt-1 text-4xl font-black tabular-nums text-white">
                    {summary ? `${summary.averageScorePercent}%` : '—'}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-white/70">
                    {summary
                      ? `${summary.completedAttempts}/${summary.totalParticipants} completed`
                      : 'Loading…'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onExportExcel ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 rounded-xl border-0 bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={onExportExcel}
                      disabled={!students.length}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20"
                    onClick={onClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:grid-cols-4 sm:gap-3 sm:px-6">
            {[
              {
                label: 'Participants',
                value: summary?.totalParticipants ?? '—',
                tone: 'bg-[#0c2340] text-white',
              },
              {
                label: 'Completed',
                value: summary?.completedAttempts ?? '—',
                tone: 'bg-emerald-600 text-white',
              },
              {
                label: 'Submissions',
                value: summary?.totalSubmissions ?? '—',
                tone: 'bg-cyan-700 text-white',
              },
              {
                label: 'Avg time',
                value: formatDuration(summary?.averageCompletionSeconds),
                tone: 'bg-amber-500 text-white',
              },
            ].map((kpi) => (
              <div key={kpi.label} className={cn('rounded-xl px-3 py-2.5 shadow-sm', kpi.tone)}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-85">
                  {kpi.label}
                </p>
                <p className="mt-0.5 text-xl font-black tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['students', `Students (${filteredStudents.length})`],
                  ['problems', `Problems (${problems.length})`],
                  ['submissions', `Submissions (${submissions.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                    tab === id
                      ? 'bg-[#0c2340] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'students' ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  aria-label="Filter by year"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y === 'all' ? 'All years' : y === '—' ? 'Year not set' : y}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search student…"
                    className="h-9 w-[11.5rem] pl-8"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            {loading ? (
              <p className="py-16 text-center text-sm text-slate-500 animate-pulse">
                Loading contest analytics…
              </p>
            ) : tab === 'students' ? (
              !students.length ? (
                <p className="py-16 text-center text-sm text-slate-500">
                  No student attempts yet for this contest.
                </p>
              ) : !filteredStudents.length ? (
                <p className="py-16 text-center text-sm text-slate-500">
                  No students match the current filters.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-3">#</th>
                          <th className="px-3 py-3">Roll</th>
                          <th className="px-3 py-3">Name</th>
                          <th className="px-3 py-3">Dept / Year</th>
                          <th className="px-3 py-3">Solved</th>
                          <th className="px-3 py-3">Score</th>
                          {problemColumns.map((p) => (
                            <th key={p.problemId || p.position} className="px-3 py-3">
                              P{p.position}
                            </th>
                          ))}
                          <th className="px-3 py-3">Lang</th>
                          <th className="px-3 py-3">Time</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Report</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((s) => (
                          <tr
                            key={s.attemptId}
                            className="border-t border-slate-100 hover:bg-slate-50/90"
                          >
                            <td className="px-3 py-2.5 tabular-nums text-slate-500">{s.rank}</td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                className="font-semibold text-cyan-700 hover:underline"
                                onClick={() => onOpenStudentReport(s.attemptId)}
                              >
                                {s.rollNumber || '—'}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-[#0c2340]">
                              {s.name || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {[s.department, s.academicYear].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">
                              {s.solvedCount}/{summary?.problemCount || 3}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold text-[#0c2340]">
                              {s.percentage}%
                              <div className="text-[10px] font-normal text-slate-500">
                                {s.totalScore}/{s.maxScore}
                              </div>
                            </td>
                            {(s.problemResults ?? []).map((p) => (
                              <td key={p.problemId || p.position} className="px-3 py-2.5">
                                <span className={statusBadge(p.status)}>
                                  {p.status === 'solved'
                                    ? '✓'
                                    : p.status === 'failed'
                                      ? '✗'
                                      : '—'}
                                </span>
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-slate-600">
                              J{s.javaAttempts}/P{s.pythonAttempts}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">
                              {formatDuration(s.durationSeconds)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={statusBadge(s.status)}>{s.status}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-100"
                                onClick={() => onOpenStudentReport(s.attemptId)}
                              >
                                Full report
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : tab === 'problems' ? (
              <DataTable
                emptyLabel="No problem analytics yet."
                rows={problems}
                preferredKeys={[
                  'position',
                  'title',
                  'difficulty',
                  'category',
                  'uniqueStudents',
                  'solvedCount',
                  'failedCount',
                  'successRate',
                  'averageScore',
                  'javaAttempts',
                  'pythonAttempts',
                  'compileFailures',
                  'runtimeFailures',
                  'wrongAnswers',
                ]}
              />
            ) : (
              <DataTable
                emptyLabel="No submissions yet."
                rows={submissions.map((s) => ({
                  student: s.studentName,
                  roll: s.rollNumber,
                  problem: s.problemTitle,
                  language: s.language,
                  status: s.status,
                  score: s.scorePercent,
                  passed: `${s.passed}/${s.total}`,
                  runtimeMs: s.runtimeMs,
                  submittedAt: s.submittedAt
                    ? new Date(String(s.submittedAt)).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                      })
                    : '—',
                }))}
                preferredKeys={[
                  'student',
                  'roll',
                  'problem',
                  'language',
                  'status',
                  'score',
                  'passed',
                  'runtimeMs',
                  'submittedAt',
                ]}
              />
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 text-center text-xs text-slate-500 sm:px-6">
            Generated {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST ·{' '}
            {COLLEGE.shortName}
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function DataTable({
  rows,
  emptyLabel,
  preferredKeys,
}: {
  rows: Record<string, unknown>[];
  emptyLabel: string;
  preferredKeys?: string[];
}) {
  if (!rows.length) {
    return <p className="py-16 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }
  const keys =
    preferredKeys?.filter((k) => rows.some((r) => k in r)) ??
    Object.keys(rows[0]!).slice(0, 12);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {keys.map((k) => (
                <th key={k} className="px-3 py-3">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 align-top hover:bg-slate-50/90">
                {keys.map((k) => (
                  <td key={k} className="px-3 py-2.5 text-slate-700">
                    {formatCell(row[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
