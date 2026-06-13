'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { AdminCardDashboardModal } from '@/components/admin/admin-card-dashboard-modal';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getTodayDateKeyInIST } from '@/lib/admin/report-date-filter';
import {
  filterReportScheduleOptions,
  formatScheduleSlotLabel,
  type ReportScheduleOption,
} from '@/lib/admin/report-schedule-options';
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
import {
  downloadConsolidatedTestReportExcel,
  downloadConsolidatedTestReportPdf,
} from '@/lib/admin/consolidated-test-report-export';
import {
  downloadAllIndividualTestReportsZip,
  type BulkIndividualFormat,
} from '@/lib/admin/bulk-individual-test-reports';
import type { TestReportsPayload } from '@/lib/admin/test-reports-data';
import { buildTestReportsCardDashboardView } from '@/lib/admin/test-reports-analytics';
import type { TestReportsCardKey } from '@/lib/admin/test-reports-card-reports';
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
  const [reportStartDate, setReportStartDate] = useState(() =>
    todayOnly ? getTodayDateKeyInIST() : '',
  );
  const [reportEndDate, setReportEndDate] = useState(() =>
    todayOnly ? getTodayDateKeyInIST() : '',
  );
  const [selectedScheduleId, setSelectedScheduleId] = useState('all');
  const [slotDownloadBusy, setSlotDownloadBusy] = useState<string | null>(null);
  const [individualFormat, setIndividualFormat] = useState<BulkIndividualFormat>('pdf');
  const [bulkExportBusy, setBulkExportBusy] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const scorecardModal = useElevateXScorecardModal();

  const load = useCallback(
    async (
      type: AdminExamType,
      testId: string,
      filters: { startDate?: string; endDate?: string; scheduleId?: string },
    ) => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = new URLSearchParams({ examType: type });
      if (testId && testId !== 'all') q.set('testId', testId);
      if (filters.startDate) q.set('startDate', filters.startDate);
      if (filters.endDate && filters.endDate !== filters.startDate) {
        q.set('endDate', filters.endDate);
      }
      if (filters.scheduleId && filters.scheduleId !== 'all') {
        q.set('scheduleId', filters.scheduleId);
      }
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
  },
    [],
  );

  useEffect(() => {
    const testIdFromUrl = searchParams.get('testId')?.trim();
    if (testIdFromUrl) setSelectedTestId(testIdFromUrl);
  }, [searchParams]);

  useEffect(() => {
    void load(examType, selectedTestId, {
      startDate: reportStartDate || undefined,
      endDate: reportEndDate || reportStartDate || undefined,
      scheduleId: selectedScheduleId,
    });
  }, [examType, selectedTestId, reportStartDate, reportEndDate, selectedScheduleId, load]);

  const hasDateFilter = Boolean(reportStartDate);
  const isDateRange =
    Boolean(reportStartDate && reportEndDate && reportEndDate !== reportStartDate);
  const dateRangeLabel = useMemo(() => {
    if (!reportStartDate) return undefined;
    if (!reportEndDate || reportEndDate === reportStartDate) return reportStartDate;
    return `${reportStartDate} – ${reportEndDate}`;
  }, [reportStartDate, reportEndDate]);

  const scheduleOptions = payload?.schedule_options ?? [];

  const visibleSchedules = useMemo(
    () =>
      filterReportScheduleOptions(scheduleOptions, {
        examType,
        testId: selectedTestId,
        dateKey: reportStartDate && !isDateRange ? reportStartDate : undefined,
        startDateKey: isDateRange ? reportStartDate : undefined,
        endDateKey: isDateRange ? reportEndDate : undefined,
      }),
    [scheduleOptions, examType, selectedTestId, reportStartDate, reportEndDate, isDateRange],
  );

  const selectedScheduleOption = useMemo(
    () =>
      selectedScheduleId === 'all'
        ? null
        : scheduleOptions.find((s) => s.id === selectedScheduleId) ?? null,
    [scheduleOptions, selectedScheduleId],
  );

  const activeScheduleLabel = useMemo(() => {
    if (payload?.schedule) {
      return formatScheduleSlotLabel({
        slot_number: payload.schedule.slot_number,
        title: payload.schedule.title,
        starts_at: payload.schedule.starts_at,
        ends_at: payload.schedule.ends_at,
      });
    }
    if (selectedScheduleOption) return formatScheduleSlotLabel(selectedScheduleOption);
    if (payload?.report_date_range_label) return `Date range (IST): ${payload.report_date_range_label}`;
    if (payload?.report_date_label) return `Date (IST): ${payload.report_date_label}`;
    if (dateRangeLabel) return `Date range (IST): ${dateRangeLabel}`;
    return undefined;
  }, [payload, selectedScheduleOption, dateRangeLabel]);

  const setExamTypeAndUrl = (type: AdminExamType) => {
    setExamType(type);
    setSelectedTestId('all');
    setSelectedScheduleId('all');
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
    setReportStartDate(getTodayDateKeyInIST());
    setReportEndDate(getTodayDateKeyInIST());
    setSelectedScheduleId('all');
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
      statusFilter !== 'all' ||
      search.trim().length > 0 ||
      selectedTestId !== 'all' ||
      selectedScheduleId !== 'all' ||
      hasDateFilter;
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
  }, [payload, filteredSummary, statusFilter, search, selectedTestId, selectedScheduleId, hasDateFilter]);

  const buildReportDownloadPayload = (rows: TestReportsPayload['rows'], summary: TestReportsPayload['summary']) => ({
    ...payload!,
    rows,
    summary,
    schedule: payload?.schedule,
    report_date: payload?.report_date,
    report_date_label: payload?.report_date_label,
    report_date_start: payload?.report_date_start,
    report_date_end: payload?.report_date_end,
    report_date_range_label: payload?.report_date_range_label,
  });

  const completedRows = useMemo(
    () => filteredRows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at)),
    [filteredRows],
  );

  const consolidatedExportOptions = useMemo(
    () => ({
      examLabel: meta.label,
      testName: selectedTestId !== 'all' ? selectedTestName : undefined,
      scheduleLabel:
        selectedScheduleId !== 'all'
          ? activeScheduleLabel
          : hasDateFilter
            ? 'All slots (overall)'
            : activeScheduleLabel,
      dateRangeLabel:
        payload?.report_date_range_label ??
        (hasDateFilter ? payload?.report_date_label ?? dateRangeLabel : undefined),
      rows: filteredRows,
      summary: filteredSummary ?? payload?.summary,
    }),
    [
      meta.label,
      selectedTestId,
      selectedTestName,
      activeScheduleLabel,
      hasDateFilter,
      dateRangeLabel,
      selectedScheduleId,
      payload?.report_date_range_label,
      payload?.report_date_label,
      filteredRows,
      filteredSummary,
      payload?.summary,
    ],
  );

  const zipBaseName = useMemo(() => {
    const parts = ['test-reports', examType];
    if (selectedTestId !== 'all') parts.push(selectedTestId.slice(0, 8));
    if (payload?.schedule?.slot_number != null) parts.push(`slot-${payload.schedule.slot_number}`);
    if (dateRangeLabel) parts.push(slugifyDateRange(dateRangeLabel));
    return parts.join('-');
  }, [examType, selectedTestId, payload?.schedule?.slot_number, dateRangeLabel]);

  function slugifyDateRange(value: string): string {
    return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  const downloadConsolidatedPdf = () => {
    if (!payload || completedRows.length === 0) return;
    downloadConsolidatedTestReportPdf(consolidatedExportOptions);
  };

  const downloadConsolidatedExcel = () => {
    if (!payload || completedRows.length === 0) return;
    downloadConsolidatedTestReportExcel(consolidatedExportOptions);
  };

  const downloadAllIndividual = async () => {
    if (!payload || completedRows.length === 0) return;
    setBulkExportBusy('individual');
    setBulkProgress(null);
    try {
      const { filesAdded, skipped } = await downloadAllIndividualTestReportsZip({
        rows: filteredRows,
        format: individualFormat,
        zipBaseName,
        onProgress: (current, total, name) => {
          setBulkProgress(`${current} / ${total} — ${name}`);
        },
      });
      const extra = skipped > 0 ? ` (${skipped} skipped)` : '';
      setBulkProgress(`Done — ${filesAdded} file${filesAdded === 1 ? '' : 's'} in ZIP${extra}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk export failed');
      setBulkProgress(null);
    } finally {
      setBulkExportBusy(null);
    }
  };

  const downloadPdf = () => {
    if (!payload || filteredRows.length === 0) return;
    downloadTestReportPdf({
      examLabel: meta.label,
      testName: selectedTestId !== 'all' ? selectedTestName : undefined,
      scheduleLabel: activeScheduleLabel,
      rows: filteredRows,
      summary: filteredSummary ?? payload.summary,
    });
  };

  const downloadCsv = () => {
    if (!payload) return;
    downloadTestReportCsv(
      buildReportDownloadPayload(filteredRows, filteredSummary ?? payload.summary),
      {
        testId: selectedTestId,
        testName: selectedTestName,
        scheduleLabel: activeScheduleLabel,
      },
    );
  };

  const fetchSlotReport = async (schedule: ReportScheduleOption) => {
    const q = new URLSearchParams({ examType, scheduleId: schedule.id });
    if (selectedTestId !== 'all') q.set('testId', selectedTestId);
    if (reportStartDate) q.set('startDate', reportStartDate);
    if (reportEndDate && reportEndDate !== reportStartDate) q.set('endDate', reportEndDate);
    const res = await fetchWithAuth(`/api/admin/test-reports?${q.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as TestReportsPayload;
  };

  const downloadSlotPdf = async (schedule: ReportScheduleOption) => {
    setSlotDownloadBusy(`${schedule.id}:pdf`);
    try {
      const slotPayload = await fetchSlotReport(schedule);
      if (!slotPayload || slotPayload.rows.length === 0) {
        alert(`No attempts found for ${formatScheduleSlotLabel(schedule)}.`);
        return;
      }
      downloadTestReportPdf({
        examLabel: meta.label,
        testName: schedule.title,
        scheduleLabel: formatScheduleSlotLabel(schedule),
        rows: slotPayload.rows,
        summary: slotPayload.summary,
      });
    } finally {
      setSlotDownloadBusy(null);
    }
  };

  const downloadSlotCsv = async (schedule: ReportScheduleOption) => {
    setSlotDownloadBusy(`${schedule.id}:csv`);
    try {
      const slotPayload = await fetchSlotReport(schedule);
      if (!slotPayload || slotPayload.rows.length === 0) {
        alert(`No attempts found for ${formatScheduleSlotLabel(schedule)}.`);
        return;
      }
      downloadTestReportCsv(slotPayload, {
        testId: schedule.test_id ?? undefined,
        testName: schedule.title,
        scheduleLabel: formatScheduleSlotLabel(schedule),
      });
    } finally {
      setSlotDownloadBusy(null);
    }
  };

  const openElevateXReport = (row: TestReportsPayload['rows'][0]) => {
    void scorecardModal.open({
      attemptId: row.attempt_id,
      studentName: row.student_name,
      rollNumber: row.roll_number || undefined,
    });
  };

  const testReportsContext = useMemo(
    () =>
      payload
        ? {
            payload: {
              ...payload,
              rows: filteredRows,
              summary: displaySummary ?? payload.summary,
            },
            examLabel: meta.label,
            testFilterLabel: selectedTestId !== 'all' ? selectedTestName : undefined,
          }
        : null,
    [payload, filteredRows, displaySummary, meta.label, selectedTestId, selectedTestName],
  );

  const detailDashboardView = useMemo(
    () =>
      detailCard && testReportsContext
        ? buildTestReportsCardDashboardView(detailCard, testReportsContext)
        : null,
    [detailCard, testReportsContext],
  );

  const openCard = (key: TestReportsCardKey) => setDetailCard(key);

  return (
    <>
      <AdminCardDashboardModal
        open={detailCard != null}
        onClose={() => setDetailCard(null)}
        view={detailDashboardView}
        fileBase={detailCard ? `test-reports-${examType}-${detailCard}` : undefined}
      />
      <AdminPageHeader
        title={todayOnly && examType === 'elevatex' ? 'ElevateX — today’s report' : 'Test reports'}
        description={
          todayOnly && payload?.report_date_label
            ? `Students who wrote ElevateX on ${payload.report_date_label} (IST). Download PDF or CSV for the examination cell.`
            : 'Select exam type, set a start/end date range, and leave slot as All slots (overall) for a combined leaderboard across every slot — download PDF, Excel, or individual reports.'
        }
        actions={
          payload ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-[#0c2340] hover:bg-[#16304f] text-white shrink-0"
                onClick={downloadConsolidatedPdf}
                disabled={completedRows.length === 0 || Boolean(bulkExportBusy)}
              >
                Leaderboard PDF
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                onClick={downloadConsolidatedExcel}
                disabled={completedRows.length === 0 || Boolean(bulkExportBusy)}
              >
                Leaderboard Excel
              </Button>
              <Button
                variant="outline"
                className="shrink-0 border-slate-300"
                onClick={downloadPdf}
                disabled={filteredRows.length === 0}
              >
                Summary PDF
              </Button>
              <Button
                variant="outline"
                className="shrink-0 border-slate-300"
                onClick={downloadCsv}
                disabled={filteredRows.length === 0}
              >
                Summary CSV
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
          <Card className="p-4 mb-6 border-[#c4a052]/30 bg-[#f8f4eb]/50">
            <p className="text-sm font-semibold text-[#0c2340] mb-1">Date range &amp; time slot</p>
            <p className="text-xs text-slate-600 mb-3">
              Pick an exam above, set a start and end date, leave time slot as{' '}
              <strong>All slots (overall)</strong> to see every student across all slots — ranked highest
              to lowest. Download leaderboard PDF/Excel or all individual reports below.
            </p>
            <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-3 items-end">
              <div className="w-full min-w-0">
                <label className="block text-xs font-medium text-slate-600 mb-1">Start date (IST)</label>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportStartDate(next);
                    if (!reportEndDate || reportEndDate < next) setReportEndDate(next);
                    if (next && selectedScheduleId !== 'all') {
                      const stillVisible = filterReportScheduleOptions(scheduleOptions, {
                        examType,
                        testId: selectedTestId,
                        dateKey: next,
                        startDateKey:
                          reportEndDate && reportEndDate !== next ? next : undefined,
                        endDateKey:
                          reportEndDate && reportEndDate !== next ? reportEndDate : undefined,
                      }).some((s) => s.id === selectedScheduleId);
                      if (!stillVisible) setSelectedScheduleId('all');
                    }
                  }}
                  className="h-9"
                />
              </div>
              <div className="w-full min-w-0">
                <label className="block text-xs font-medium text-slate-600 mb-1">End date (IST)</label>
                <Input
                  type="date"
                  value={reportEndDate}
                  min={reportStartDate || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportEndDate(next);
                    if (next && selectedScheduleId !== 'all') {
                      const start = reportStartDate || next;
                      const stillVisible = filterReportScheduleOptions(scheduleOptions, {
                        examType,
                        testId: selectedTestId,
                        dateKey: start === next ? next : undefined,
                        startDateKey: start !== next ? start : undefined,
                        endDateKey: start !== next ? next : undefined,
                      }).some((s) => s.id === selectedScheduleId);
                      if (!stillVisible) setSelectedScheduleId('all');
                    }
                  }}
                  className="h-9"
                />
              </div>
              <div className="w-full min-w-0">
                <label className="block text-xs font-medium text-slate-600 mb-1">Time slot</label>
                <select
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                >
                  <option value="all">
                    {hasDateFilter
                      ? isDateRange
                        ? `All slots — overall (${dateRangeLabel})`
                        : `All slots — overall (${reportStartDate})`
                      : 'All slots / all dates (overall)'}
                  </option>
                  {visibleSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {formatScheduleSlotLabel(schedule)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setReportStartDate('');
                  setReportEndDate('');
                  setSelectedScheduleId('all');
                }}
              >
                Clear dates &amp; slot
              </Button>
            </div>
            {activeScheduleLabel ? (
              <p className="text-xs text-slate-600 mt-3">
                Active filter: <strong>{activeScheduleLabel}</strong>
                {selectedScheduleId === 'all' && hasDateFilter ? (
                  <span> — one row per student, ranked by score (highest first)</span>
                ) : null}
              </p>
            ) : null}
            {selectedScheduleId === 'all' && hasDateFilter && completedRows.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-[#c4a052]/25 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#0c2340] hover:bg-[#16304f] text-white"
                  disabled={Boolean(bulkExportBusy)}
                  onClick={downloadConsolidatedPdf}
                >
                  Overall leaderboard PDF ({completedRows.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={Boolean(bulkExportBusy)}
                  onClick={downloadConsolidatedExcel}
                >
                  Overall leaderboard Excel ({completedRows.length})
                </Button>
              </div>
            ) : null}
            {visibleSchedules.length > 1 ? (
              <div className="mt-4 pt-4 border-t border-[#c4a052]/25">
                <p className="text-xs font-medium text-slate-700 mb-2">
                  Download each slot separately ({visibleSchedules.length} slots
                  {hasDateFilter ? ` in ${dateRangeLabel}` : ''})
                </p>
                <div className="flex flex-wrap gap-2">
                  {visibleSchedules.map((schedule) => {
                    const label = schedule.slot_number
                      ? `Slot ${schedule.slot_number}`
                      : schedule.title;
                    const pdfBusy = slotDownloadBusy === `${schedule.id}:pdf`;
                    const csvBusy = slotDownloadBusy === `${schedule.id}:csv`;
                    return (
                      <div
                        key={schedule.id}
                        className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1"
                      >
                        <span className="text-xs font-semibold text-[#0c2340] px-1">{label}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={Boolean(slotDownloadBusy)}
                          onClick={() => void downloadSlotPdf(schedule)}
                        >
                          {pdfBusy ? '…' : 'PDF'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={Boolean(slotDownloadBusy)}
                          onClick={() => void downloadSlotCsv(schedule)}
                        >
                          {csvBusy ? '…' : 'CSV'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : visibleSchedules.length === 0 && hasDateFilter ? (
              <p className="text-xs text-amber-800 mt-3">
                No scheduled slots found in {dateRangeLabel} for this filter. You can still use{' '}
                <strong>All slots (overall)</strong> for the combined student list.
              </p>
            ) : null}
          </Card>

          <Card className="p-4 mb-6 border-[#0c2340]/15 bg-white">
            <p className="text-sm font-semibold text-[#0c2340] mb-1">Bulk export</p>
            <p className="text-xs text-slate-600 mb-4">
              Uses the current filters (exam type, test, date, slot, search).{' '}
              <strong>{completedRows.length}</strong> completed student
              {completedRows.length === 1 ? '' : 's'} ready to export.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Consolidated leaderboard
                </p>
                <p className="text-sm text-slate-700 mb-3">
                  One sheet for the whole exam — students ranked highest to lowest. Excel includes{' '}
                  <strong>Winners</strong>, <strong>Top 100</strong>, and <strong>Top 200</strong> tabs.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#0c2340] hover:bg-[#16304f] text-white"
                    disabled={completedRows.length === 0 || Boolean(bulkExportBusy)}
                    onClick={downloadConsolidatedPdf}
                  >
                    Leaderboard PDF
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={completedRows.length === 0 || Boolean(bulkExportBusy)}
                    onClick={downloadConsolidatedExcel}
                  >
                    Leaderboard Excel
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  All individual student reports
                </p>
                <p className="text-sm text-slate-700 mb-3">
                  One click downloads a ZIP with a separate report for every completed student
                  (ElevateX = section-wise scorecard; other exams = attempt summary).
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[120px]">
                    <label className="block text-xs font-medium text-slate-600 mb-1">File type</label>
                    <select
                      className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                      value={individualFormat}
                      onChange={(e) => setIndividualFormat(e.target.value as BulkIndividualFormat)}
                      disabled={Boolean(bulkExportBusy)}
                    >
                      <option value="pdf">PDF (ZIP)</option>
                      <option value="csv">CSV (ZIP)</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#1e3a5f]/40 text-[#0c2340] font-semibold"
                    disabled={completedRows.length === 0 || Boolean(bulkExportBusy)}
                    onClick={() => void downloadAllIndividual()}
                  >
                    {bulkExportBusy === 'individual'
                      ? 'Preparing ZIP…'
                      : `Download all (${individualFormat.toUpperCase()})`}
                  </Button>
                </div>
                {bulkProgress ? (
                  <p className="text-xs text-slate-600 mt-2 tabular-nums">{bulkProgress}</p>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
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
            <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
              <div className="w-full min-w-0">
                <label className="block text-xs font-medium text-slate-600 mb-1">Search student</label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email, or roll number"
                  className="h-9"
                />
              </div>
              <div className="w-full min-w-0">
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
              <div className="w-full min-w-0">
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
                <table className="admin-table app-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Test</th>
                      {selectedScheduleId === 'all' ? <th className="hidden lg:table-cell">Slot</th> : null}
                      <th>Score</th>
                      <th>Status</th>
                      <th className="hidden md:table-cell">Finished</th>
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
                        <td className="min-w-0">
                          <p className="font-medium text-[#0c2340] truncate">{row.student_name}</p>
                          <p className="text-xs text-slate-500 truncate">{row.email}</p>
                          <p className="text-xs text-slate-600 truncate">
                            {showReport && row.roll_number ? (
                              <button
                                type="button"
                                className="font-mono text-[#1e3a5f] font-semibold underline-offset-2 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openElevateXReport(row);
                                }}
                              >
                                {row.roll_number}
                              </button>
                            ) : (
                              <span className="font-mono">{row.roll_number || '—'}</span>
                            )}
                            {row.branch ? ` · ${row.branch}` : ''}
                          </p>
                        </td>
                        <td className="text-sm text-slate-800 truncate" title={row.test_name}>
                          {row.test_name}
                        </td>
                        {selectedScheduleId === 'all' ? (
                          <td className="hidden lg:table-cell text-xs text-slate-600 truncate">
                            {row.slot_number != null
                              ? `Slot ${row.slot_number}`
                              : row.schedule_title
                                ? row.schedule_title
                                : row.completed_at
                                  ? new Date(row.completed_at).toLocaleString('en-IN', {
                                      timeZone: 'Asia/Kolkata',
                                      day: '2-digit',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                          </td>
                        ) : null}
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
                        <td className="hidden md:table-cell text-sm text-slate-600">
                          {row.completed_at ? (
                            new Date(row.completed_at).toLocaleString()
                          ) : isInProgressStatus(row.status) ? (
                            <span className="text-amber-700 font-medium text-xs">
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
