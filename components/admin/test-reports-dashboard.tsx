'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { StatDetailReportModal } from '@/components/reports/stat-detail-report-modal';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getTodayDateKeyInIST } from '@/lib/admin/report-date-filter';
import { ElevateXScorecardReportModal } from '@/components/admin/elevatex-scorecard-report-modal';
import { useElevateXScorecardModal } from '@/hooks/use-elevatex-scorecard-modal';
import {
  ADMIN_EXAM_TYPES,
  ADMIN_EXAM_TYPE_META,
  parseAdminExamType,
  type AdminExamType,
} from '@/lib/admin/exam-type';
import {
  downloadTestReportCsv,
  filterReportRows,
} from '@/lib/admin/export-test-report-csv';
import { downloadTestReportPdf } from '@/lib/admin/export-test-report-pdf';
import type { TestReportsPayload } from '@/lib/admin/test-reports-data';
import {
  buildTestReportsCardReport,
  type TestReportsCardKey,
} from '@/lib/admin/test-reports-card-reports';
import {
  attemptStatusBadgeClass,
  formatAttemptStatus,
  isCompletedAttemptStatus,
  isInProgressStatus,
} from '@/lib/attempt-status';
import { formatScorePercentLabel, averageScorePercent, roundRatePercent, roundScorePercent } from '@/lib/format-score';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'in_progress' | 'completed';

function canOpenElevateXReport(row: TestReportsPayload['rows'][0]): boolean {
  return (
    row.exam_type === 'elevatex' && isCompletedAttemptStatus(row.status, row.completed_at)
  );
}

export function TestReportsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const todayOnly =
    searchParams.get('today') === '1' ||
    searchParams.get('date') === 'today' ||
    searchParams.get('date') === getTodayDateKeyInIST();
  const initialType = todayOnly
    ? 'elevatex'
    : parseAdminExamType(searchParams.get('type') ?? searchParams.get('examType'));

  const [examType, setExamType] = useState<AdminExamType>(initialType);
  const [selectedTestId, setSelectedTestId] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [payload, setPayload] = useState<TestReportsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailCard, setDetailCard] = useState<TestReportsCardKey | null>(null);
  const scorecardModal = useElevateXScorecardModal();

  const load = useCallback(async (type: AdminExamType, testId: string, today: boolean) => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = new URLSearchParams({ examType: type });
      if (testId && testId !== 'all') q.set('testId', testId);
      if (today) q.set('date', 'today');
      const res = await fetchWithAuth(`/api/admin/test-reports?${q.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setPayload(null);
        if (res.status === 504) {
          setLoadError('Report timed out. Refresh the page, or try again in a minute.');
        } else if (res.status === 401) {
          setLoadError('Session expired. Sign in again at Admin Login.');
        } else {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          setLoadError(json.error ?? 'Could not load report');
        }
        return;
      }
      setPayload((await res.json()) as TestReportsPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const testIdFromUrl = searchParams.get('testId')?.trim();
    if (testIdFromUrl) setSelectedTestId(testIdFromUrl);
  }, [searchParams]);

  useEffect(() => {
    void load(examType, selectedTestId, todayOnly);
  }, [examType, selectedTestId, todayOnly, load]);

  const setExamTypeAndUrl = (type: AdminExamType) => {
    setExamType(type);
    setSelectedTestId('all');
    const params = new URLSearchParams();
    if (todayOnly) params.set('today', '1');
    if (type !== 'all') params.set('type', type);
    const qs = params.toString();
    router.replace(qs ? `/admin/reports?${qs}` : '/admin/reports', { scroll: false });
  };

  const openTodayElevateX = () => {
    router.replace('/admin/reports?type=elevatex&today=1', { scroll: false });
    setExamType('elevatex');
    setStatusFilter('all');
  };

  const filteredRows = useMemo(() => {
    if (!payload) return [];
    let rows = filterReportRows(payload.rows, search);
    if (statusFilter === 'in_progress') {
      rows = rows.filter((r) => isInProgressStatus(r.status) && !r.completed_at);
    } else if (statusFilter === 'completed') {
      rows = rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at));
    }
    return rows;
  }, [payload, search, statusFilter]);

  const selectedTestName =
    payload?.tests.find((t) => t.id === selectedTestId)?.name ?? undefined;

  const meta = ADMIN_EXAM_TYPE_META[examType];

  const filteredSummary = useMemo(() => {
    if (filteredRows.length === 0) return null;
    const completedRows = filteredRows.filter((r) =>
      isCompletedAttemptStatus(r.status, r.completed_at),
    );
    const inProgressCount = filteredRows.filter(
      (r) => isInProgressStatus(r.status) && !r.completed_at,
    ).length;
    const scores = completedRows.map((r) => r.score);
    const uniqueStudents = new Set(filteredRows.map((r) => r.user_id)).size;
    const passed = scores.filter((s) => s >= 40).length;
    return {
      total_attempts: filteredRows.length,
      in_progress_count: inProgressCount,
      completed_count: completedRows.length,
      unique_students: uniqueStudents,
      avg_score: scores.length > 0 ? averageScorePercent(scores) : 0,
      pass_rate: scores.length > 0 ? roundRatePercent((passed / scores.length) * 100) : 0,
      highest_score: scores.length > 0 ? roundScorePercent(Math.max(...scores)) : 0,
    };
  }, [filteredRows]);

  const displaySummary = useMemo(() => {
    if (!payload) return null;
    const hasActiveFilter =
      statusFilter !== 'all' || search.trim().length > 0 || selectedTestId !== 'all';
    if (!hasActiveFilter) return payload.summary;
    return (
      filteredSummary ?? {
        ...payload.summary,
        total_attempts: 0,
        in_progress_count: 0,
        completed_count: 0,
        unique_students: 0,
        avg_score: 0,
        pass_rate: 0,
        highest_score: 0,
      }
    );
  }, [payload, filteredSummary, statusFilter, search, selectedTestId]);

  const downloadPdf = () => {
    if (!payload || filteredRows.length === 0) return;
    downloadTestReportPdf({
      examLabel: meta.label,
      testName: selectedTestId !== 'all' ? selectedTestName : undefined,
      scheduleLabel: payload.report_date_label
        ? `Report date (IST): ${payload.report_date_label}`
        : undefined,
      rows: filteredRows,
      summary: filteredSummary ?? payload.summary,
    });
  };

  const downloadCsv = () => {
    if (!payload) return;
    downloadTestReportCsv(
      {
        ...payload,
        rows: filteredRows,
        summary: filteredSummary ?? payload.summary,
      },
      {
        testId: selectedTestId,
        testName: selectedTestName,
      },
    );
  };

  const openElevateXReport = (row: TestReportsPayload['rows'][0]) => {
    void scorecardModal.open({
      attemptId: row.attempt_id,
      studentName: row.student_name,
      rollNumber: row.roll_number || undefined,
    });
  };

  const detailReport =
    payload && detailCard
      ? buildTestReportsCardReport(detailCard, {
          payload: {
            ...payload,
            rows: filteredRows,
            summary: displaySummary ?? payload.summary,
          },
          examLabel: meta.label,
          testFilterLabel: selectedTestId !== 'all' ? selectedTestName : undefined,
        })
      : null;

  const openCard = (key: TestReportsCardKey) => setDetailCard(key);

  return (
    <>
      <StatDetailReportModal
        open={detailCard != null}
        onClose={() => setDetailCard(null)}
        report={detailReport}
        fileBase={detailCard ? `test-reports-${examType}-${detailCard}` : undefined}
      />
      <AdminPageHeader
        title={todayOnly && examType === 'elevatex' ? 'ElevateX — today’s report' : 'Test reports'}
        description={
          todayOnly && payload?.report_date_label
            ? `Students who wrote ElevateX on ${payload.report_date_label} (IST). Download PDF or CSV for the examination cell.`
            : 'Per-exam dashboards with student scores — download overall exam reports as PDF or CSV.'
        }
        actions={
          payload ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-[#0c2340] hover:bg-[#16304f] text-white shrink-0"
                onClick={downloadPdf}
                disabled={filteredRows.length === 0}
              >
                Download report (PDF)
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                onClick={downloadCsv}
                disabled={filteredRows.length === 0}
              >
                Download report (CSV)
              </Button>
            </div>
          ) : null
        }
      />

      {todayOnly && examType === 'elevatex' ? (
        <Card className="mb-6 border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-sm text-emerald-950">
            <span className="font-semibold">Today only (IST):</span>{' '}
            {payload?.report_date_label ?? 'Loading…'} — ranked by score. Use{' '}
            Click a <span className="font-semibold">roll number</span> or{' '}
            <span className="font-semibold">Full report</span> for the section-wise scorecard (PDF download in
            popup).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter('completed')}>
              Completed today
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter('all')}>
              All activity today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.replace('/admin/reports?type=elevatex', { scroll: false })}
            >
              All ElevateX dates
            </Button>
          </div>
        </Card>
      ) : examType === 'elevatex' ? (
        <Card className="mb-6 border-blue-100 bg-blue-50/60 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            Need only students who submitted <span className="font-semibold">today</span>?
          </p>
          <Button
            type="button"
            size="sm"
            className="bg-[#0c2340] hover:bg-[#16304f] text-white"
            onClick={openTodayElevateX}
          >
            ElevateX report — today
          </Button>
        </Card>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">
        {ADMIN_EXAM_TYPES.map((type) => {
          const active = examType === type;
          const label = ADMIN_EXAM_TYPE_META[type].label;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setExamTypeAndUrl(type)}
              className={cn(
                'shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold border transition',
                active
                  ? 'bg-[#0c2340] text-white border-[#0c2340] shadow-md'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <Card className="p-4 mb-6 border-slate-200 bg-slate-50/80">
        <p className="text-sm font-semibold text-[#0c2340]">{meta.label}</p>
        <p className="text-xs text-slate-600 mt-1">{meta.description}</p>
      </Card>

      {loading ? (
        <LoadingScreen message="Loading test report…" className="min-h-[40vh]" />
      ) : !payload ? (
        <Card className="p-8 text-center text-slate-600">
          {loadError ?? 'Could not load report data.'}
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <StatCard
              label="Attempts"
              value={displaySummary?.total_attempts ?? 0}
              accent="navy"
              onClick={() => openCard('total_attempts')}
            />
            <StatCard
              label="In progress"
              value={displaySummary?.in_progress_count ?? 0}
              accent="amber"
              onClick={() => openCard('in_progress')}
            />
            <StatCard
              label="Completed"
              value={displaySummary?.completed_count ?? 0}
              accent="cyan"
              onClick={() => openCard('completed')}
            />
            <StatCard
              label="Students"
              value={displaySummary?.unique_students ?? 0}
              accent="blue"
              onClick={() => openCard('unique_students')}
            />
            <StatCard
              label="Avg (completed)"
              value={formatScorePercentLabel(displaySummary?.avg_score ?? 0)}
              accent="emerald"
              onClick={() => openCard('avg_score')}
            />
            <StatCard
              label="Highest"
              value={formatScorePercentLabel(displaySummary?.highest_score ?? 0)}
              accent="amber"
              onClick={() => openCard('highest_score')}
            />
          </div>

          <Card className="p-4 mb-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Search student</label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email, or roll number"
                  className="h-9"
                />
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by test</label>
                <select
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={selectedTestId}
                  onChange={(e) => setSelectedTestId(e.target.value)}
                >
                  <option value="all">All tests in {meta.label}</option>
                  {payload.tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.attempt_count})
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[180px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="all">All statuses</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </Card>

          {filteredRows.length === 0 ? (
            <Card className="p-10 text-center text-slate-600">
              <p className="font-medium">No attempts for this filter</p>
              <p className="text-sm mt-2">
                Students will appear here after they complete {meta.label === 'All tests' ? 'an exam' : meta.label}.
              </p>
              {examType === 'elevatex' ? (
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/admin/evalora-modules">Go live with ElevateX</Link>
                </Button>
              ) : null}
            </Card>
          ) : (
            <Card className="overflow-hidden border-slate-200">
              <div className="overflow-x-auto">
                <table className="app-table w-full min-w-[900px]">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll</th>
                      <th>Branch</th>
                      <th>Test</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Finished</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const showReport = canOpenElevateXReport(row);
                      return (
                      <tr
                        key={row.attempt_id}
                        className={cn(showReport && 'cursor-pointer hover:bg-slate-50/80')}
                        onClick={
                          showReport
                            ? () => openElevateXReport(row)
                            : undefined
                        }
                      >
                        <td>
                          <p className="font-medium text-[#0c2340]">{row.student_name}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[12rem]">{row.email}</p>
                        </td>
                        <td className="font-mono text-xs">
                          {showReport && row.roll_number ? (
                            <button
                              type="button"
                              className="text-[#1e3a5f] font-semibold underline-offset-2 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openElevateXReport(row);
                              }}
                            >
                              {row.roll_number}
                            </button>
                          ) : (
                            <span className="text-slate-700">{row.roll_number || '—'}</span>
                          )}
                        </td>
                        <td className="text-sm text-slate-700">{row.branch ?? '—'}</td>
                        <td className="text-sm text-slate-800 max-w-[10rem] truncate" title={row.test_name}>
                          {row.test_name}
                        </td>
                        <td>
                          <span
                            className={cn(
                              'font-bold tabular-nums',
                              row.score >= 60
                                ? 'text-emerald-700'
                                : row.score >= 40
                                  ? 'text-amber-700'
                                  : 'text-red-700',
                            )}
                          >
                            {formatScorePercentLabel(row.score)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                              attemptStatusBadgeClass(row.status),
                            )}
                          >
                            {formatAttemptStatus(row.status)}
                          </span>
                        </td>
                        <td className="text-sm text-slate-600 whitespace-nowrap">
                          {row.completed_at ? (
                            new Date(row.completed_at).toLocaleString()
                          ) : isInProgressStatus(row.status) ? (
                            <span className="text-amber-700 font-medium">
                              Started {new Date(row.created_at).toLocaleString()}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {showReport ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[#1e3a5f] border-[#1e3a5f]/30"
                              disabled={scorecardModal.loading}
                              onClick={() => openElevateXReport(row)}
                            >
                              Full report
                            </Button>
                          ) : row.exam_type === 'elevatex' &&
                            isInProgressStatus(row.status) ? (
                            <span className="text-xs text-amber-700 font-medium">In exam</span>
                          ) : (
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/admin/users`}>User</Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 px-4 py-3 border-t border-slate-100">
                Showing {filteredRows.length} of {payload.rows.length} attempts
                {search ? ' (search filtered)' : ''}.
              </p>
            </Card>
          )}
        </>
      )}

      <ElevateXScorecardReportModal
        open={scorecardModal.isOpen}
        onClose={scorecardModal.close}
        studentName={scorecardModal.target?.studentName ?? ''}
        rollNumber={scorecardModal.target?.rollNumber}
        scorecard={scorecardModal.scorecard}
        loading={scorecardModal.loading}
        loadError={scorecardModal.loadError}
      />
    </>
  );
}
