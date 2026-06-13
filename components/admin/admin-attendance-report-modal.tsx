'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Search,
  Users,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  buildAttendanceAnalytics,
  buildAttendanceReportPayload,
} from '@/lib/admin/attendance-report';
import type {
  AdminDashboardAttempt,
  AdminDashboardStudent,
} from '@/lib/admin/dashboard-card-reports';
import { COLLEGE } from '@/lib/college-brand';
import {
  formatDateKeyLabel,
  getTodayDateKeyInIST,
} from '@/lib/admin/report-date-filter';
import { formatScorePercentLabel } from '@/lib/format-score';
import {
  downloadTableReportExcel,
  downloadTableReportPdf,
} from '@/lib/reports/table-report';
import { cn } from '@/lib/utils';

type AdminAttendanceReportModalProps = {
  open: boolean;
  onClose: () => void;
  dateKey: string;
  onDateKeyChange: (dateKey: string) => void;
  students: AdminDashboardStudent[];
  attempts: AdminDashboardAttempt[];
};

type ViewTab = 'overview' | 'present' | 'absent';

const PIE_COLORS = ['#10b981', '#cbd5e1'];

const pieChartConfig = {
  present: { label: 'Present', color: '#10b981' },
  absent: { label: 'Absent', color: '#94a3b8' },
};

const branchChartConfig = {
  attended: { label: 'Present', color: '#1e3a5f' },
  absent: { label: 'Absent', color: '#cbd5e1' },
};

function truncateLabel(value: string, max = 22): string {
  const t = value.trim() || '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function AdminAttendanceReportModal({
  open,
  onClose,
  dateKey,
  onDateKeyChange,
  students,
  attempts,
}: AdminAttendanceReportModalProps) {
  const todayKey = getTodayDateKeyInIST();
  const [mounted, setMounted] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [view, setView] = useState<ViewTab>('overview');
  const [search, setSearch] = useState('');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setChartsReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

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

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) set.add(s.branch?.trim() || '—');
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [students]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) set.add(s.academic_year?.trim() || '—');
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [students]);

  const analytics = useMemo(
    () =>
      buildAttendanceAnalytics(dateKey, students, attempts, {
        branch: branchFilter,
        year: yearFilter,
      }),
    [dateKey, students, attempts, branchFilter, yearFilter],
  );

  const exportPayload = useMemo(
    () =>
      buildAttendanceReportPayload(dateKey, students, attempts, {
        branch: branchFilter,
        year: yearFilter,
      }),
    [dateKey, students, attempts, branchFilter, yearFilter],
  );

  const pieData = useMemo(
    () => [
      { name: 'present', value: analytics.summary.attendedCount, label: 'Present' },
      { name: 'absent', value: analytics.summary.absentCount, label: 'Absent' },
    ],
    [analytics.summary.attendedCount, analytics.summary.absentCount],
  );

  const branchBarData = useMemo(
    () =>
      analytics.byBranch.map((b) => ({
        branch: truncateLabel(b.branch, 18),
        fullBranch: b.branch,
        attended: b.attended,
        absent: b.absent,
        rate: b.rate,
        total: b.total,
      })),
    [analytics.byBranch],
  );

  const yearBarData = useMemo(
    () =>
      analytics.byYear.map((y) => ({
        year: y.year === '—' ? 'Not set' : `Year ${y.year}`,
        attended: y.attended,
        absent: y.absent,
        rate: y.rate,
        total: y.total,
      })),
    [analytics.byYear],
  );

  const listRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = analytics.rows;
    if (view === 'present') rows = rows.filter((r) => r.status === 'Attended');
    if (view === 'absent') rows = rows.filter((r) => r.status === 'Absent');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.roll.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q),
    );
  }, [analytics.rows, view, search]);

  const shiftDate = (deltaDays: number) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return;
    const next = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
    onDateKeyChange(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(next),
    );
  };

  const fileBase = `attendance-${dateKey}${branchFilter !== 'all' ? `-${branchFilter}` : ''}`;

  if (!open || !mounted) return null;

  const { summary } = analytics;
  const rateLabel = formatScorePercentLabel(summary.attendanceRate);

  const modal = (
    <div
      className="fixed inset-0 z-[210] overflow-y-auto overscroll-contain animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-dashboard-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-[#0a1628]/75 backdrop-blur-md cursor-default"
        aria-label="Close attendance report"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
        <div
          className="admin-modal-panel relative z-[1] my-auto max-h-[min(calc(100dvh-1.5rem),900px)] flex flex-col overflow-hidden rounded-[1.5rem] border border-[#c4a052]/30 bg-[#f8fafc] shadow-[0_32px_80px_-12px_rgba(12,35,64,0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Poster header */}
          <header className="admin-modal-dark-header relative shrink-0 overflow-hidden px-6 sm:px-8 pt-8 pb-10 text-white">
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#0c2340] via-[#1e3a5f] to-[#0f4c5c]"
              aria-hidden
            />
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 90% 70% at 0% -10%, rgba(16,185,129,0.22), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(196,160,82,0.2), transparent 50%)',
              }}
              aria-hidden
            />
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c4a052] to-transparent" />

            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#e8d5a8]/90">
                  {COLLEGE.rce} · {COLLEGE.departmentTitle}
                </p>
                <h2
                  id="attendance-dashboard-title"
                  className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white"
                >
                  Student Attendance
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
                  <CalendarDays className="h-4 w-4 text-[#c4a052]" aria-hidden />
                  <span className="font-semibold text-white">{formatDateKeyLabel(dateKey)}</span>
                  <span className="text-white/50">·</span>
                  <span>IST</span>
                </p>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 backdrop-blur-sm text-center min-w-[140px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/90">
                    Present today
                  </p>
                  <p className="mt-1 text-4xl sm:text-5xl font-black tabular-nums text-emerald-300">
                    {rateLabel}
                  </p>
                  <p className="text-xs text-white/70 mt-1 tabular-nums">
                    {summary.attendedCount} / {summary.totalStudents} students
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                    onClick={() => downloadTableReportExcel(exportPayload, fileBase)}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-xl bg-[#f8f4eb] text-[#0c2340] hover:bg-white font-semibold"
                    onClick={() => downloadTableReportPdf(exportPayload, fileBase)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button
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

          {/* Filters */}
          <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 sm:px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  type="date"
                  value={dateKey}
                  max={todayKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) onDateKeyChange(v);
                  }}
                  className="w-[11rem] h-9"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={dateKey === todayKey ? 'default' : 'outline'}
                  className={cn('h-9', dateKey === todayKey && 'bg-[#0c2340] hover:bg-[#16304f]')}
                  onClick={() => onDateKeyChange(todayKey)}
                >
                  Today
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => shiftDate(-1)}>
                  ← Prev
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={dateKey >= todayKey}
                  onClick={() => shiftDate(1)}
                >
                  Next →
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 items-center lg:ml-auto">
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-[#0c2340] bg-white min-w-[9rem]"
                  aria-label="Filter by branch"
                >
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>
                      {b === 'all' ? 'All branches' : b}
                    </option>
                  ))}
                </select>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-[#0c2340] bg-white min-w-[8rem]"
                  aria-label="Filter by year"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y === 'all' ? 'All years' : y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-5">
            {/* KPI strip — 4 only */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: 'Registered',
                  value: summary.totalStudents,
                  icon: Users,
                  tone: 'bg-[#0c2340] text-white',
                },
                {
                  label: 'Present',
                  value: summary.attendedCount,
                  icon: UserCheck,
                  tone: 'bg-emerald-600 text-white',
                },
                {
                  label: 'Absent',
                  value: summary.absentCount,
                  icon: UserX,
                  tone: 'bg-slate-500 text-white',
                },
                {
                  label: 'Attempts today',
                  value: summary.attemptsOnDate,
                  icon: CalendarDays,
                  tone: 'bg-[#1e3a5f] text-white',
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className={cn(
                    'rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm',
                    kpi.tone,
                  )}
                >
                  <kpi.icon className="h-8 w-8 opacity-80 shrink-0" aria-hidden />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                      {kpi.label}
                    </p>
                    <p className="text-2xl font-black tabular-nums">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* View tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
              {(
                [
                  ['overview', 'Charts & overview'],
                  ['present', `Present (${summary.attendedCount})`],
                  ['absent', `Absent (${summary.absentCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                    view === id
                      ? 'bg-[#0c2340] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={cn(view !== 'overview' && 'hidden')} aria-hidden={view !== 'overview'}>
              <div
                className={cn(
                  'grid lg:grid-cols-2 gap-4',
                  chartsReady ? 'opacity-100' : 'opacity-0',
                  'transition-opacity duration-100',
                )}
              >
                {/* Donut */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0c2340] mb-1">Present vs absent</h3>
                  <p className="text-xs text-slate-500 mb-3">Share of students who wrote a test today</p>
                  {summary.totalStudents === 0 ? (
                    <p className="text-sm text-slate-500 py-12 text-center">No students in this filter.</p>
                  ) : (
                    <ChartContainer config={pieChartConfig} className="mx-auto h-[220px] max-w-[280px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={56}
                          outerRadius={80}
                          paddingAngle={2}
                          strokeWidth={2}
                          stroke="#fff"
                          isAnimationActive={false}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  )}
                  <div className="flex justify-center gap-6 mt-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Present {summary.attendedCount}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                      Absent {summary.absentCount}
                    </span>
                  </div>
                </div>

                {/* Branch bars */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0c2340] mb-1">By branch</h3>
                  <p className="text-xs text-slate-500 mb-3">Present students per department</p>
                  {branchBarData.length === 0 ? (
                    <p className="text-sm text-slate-500 py-12 text-center">No branch data.</p>
                  ) : (
                    <ChartContainer config={branchChartConfig} className="h-[240px] min-h-[240px] w-full">
                      <BarChart data={branchBarData} layout="vertical" margin={{ left: 4, right: 12 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="branch"
                          width={100}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name, item) => {
                                const row = item.payload as {
                                  fullBranch?: string;
                                  rate?: number;
                                  total?: number;
                                };
                                if (name === 'attended') {
                                  return [
                                    `${value} present (${row.rate ?? 0}% of ${row.total ?? 0})`,
                                    row.fullBranch ?? 'Branch',
                                  ];
                                }
                                return [value, 'Absent'];
                              }}
                            />
                          }
                        />
                        <Bar
                          dataKey="attended"
                          fill="var(--color-attended)"
                          radius={[0, 4, 4, 0]}
                          stackId="a"
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="absent"
                          fill="#e2e8f0"
                          radius={[0, 4, 4, 0]}
                          stackId="a"
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>

                {/* Year bars — full width */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm lg:col-span-2">
                  <h3 className="text-sm font-bold text-[#0c2340] mb-1">By academic year</h3>
                  <p className="text-xs text-slate-500 mb-3">Attendance rate per year group</p>
                  {yearBarData.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">No year data.</p>
                  ) : (
                    <ChartContainer config={branchChartConfig} className="h-[200px] min-h-[200px] w-full">
                      <BarChart data={yearBarData} margin={{ bottom: 8 }}>
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis hide />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name, item) => {
                                const row = item.payload as { rate?: number; total?: number };
                                if (name === 'attended') {
                                  return [`${value} (${row.rate ?? 0}%)`, 'Present'];
                                }
                                return [value, 'Absent'];
                              }}
                            />
                          }
                        />
                        <Bar dataKey="attended" fill="#059669" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        <Bar dataKey="absent" fill="#e2e8f0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>
              </div>
            </div>

            <div className={cn(view === 'overview' && 'hidden')} aria-hidden={view === 'overview'}>
              <div className="space-y-3">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, roll, email…"
                    className="pl-9 h-9"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm">
                  <div className="overflow-x-auto max-h-[min(42vh,360px)] overflow-y-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="sticky top-0 z-10 bg-[#0c2340] text-white text-left">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Student</th>
                          <th className="py-2.5 px-3 font-semibold">Roll</th>
                          <th className="py-2.5 px-3 font-semibold">Branch</th>
                          <th className="py-2.5 px-3 font-semibold">Year</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Attempts</th>
                          <th className="py-2.5 px-3 font-semibold">Tests</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-500">
                              No students match this view.
                            </td>
                          </tr>
                        ) : (
                          listRows.map((row) => (
                            <tr
                              key={row.studentId}
                              className="border-t border-slate-100 hover:bg-slate-50/80"
                            >
                              <td className="py-2 px-3">
                                <p className="font-medium text-[#0c2340]">{row.name}</p>
                                <p className="text-xs text-slate-500 truncate max-w-[12rem]">{row.email}</p>
                              </td>
                              <td className="py-2 px-3 font-mono text-xs">{row.roll}</td>
                              <td className="py-2 px-3 text-slate-700 max-w-[8rem] truncate" title={row.branch}>
                                {row.branch}
                              </td>
                              <td className="py-2 px-3 text-slate-700">{row.year}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                {row.attemptsOnDate}
                              </td>
                              <td className="py-2 px-3 text-slate-600 max-w-[10rem] truncate" title={row.testsOnDate}>
                                {row.testsOnDate}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-4 sm:px-6 py-3 text-center text-xs text-slate-500">
            Generated {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST ·{' '}
            {COLLEGE.shortName}
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
