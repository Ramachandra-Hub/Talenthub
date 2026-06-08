'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatAttemptStatus,
  isCompletedAttemptStatus,
  isInProgressStatus,
} from '@/lib/attempt-status';
import {
  averageScorePercent,
  formatScorePercentLabel,
  roundRatePercent,
  roundScorePercent,
} from '@/lib/format-score';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ADMIN_EXAM_TYPE_META } from '@/lib/admin/exam-type';
import { downloadTestReportCsv } from '@/lib/admin/export-test-report-csv';
import { downloadTestReportPdf } from '@/lib/admin/export-test-report-pdf';
import {
  isDashboardOverviewTest,
  resolveReportFiltersForOverview,
} from '@/lib/admin/dashboard-test-report';
import { scheduleLabelForTestOverview } from '@/lib/admin/test-overview-report';
import type { TestReportRow, TestReportsPayload } from '@/lib/admin/test-reports-data';
import type { AdminTestOverviewItem } from '@/lib/admin/tests-overview-data';
import { formatCollegeDateTime } from '@/lib/college-timezone';
import { ElevateXScorecardReportModal } from '@/components/admin/elevatex-scorecard-report-modal';
import { useElevateXScorecardModal } from '@/hooks/use-elevatex-scorecard-modal';
import { cn } from '@/lib/utils';

type AdminTestDetailModalProps = {
  test: AdminTestOverviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
  /** Limit results to these students (dashboard filters). */
  scopeUserIds?: string[];
};

function computeSummaryFromRows(rows: TestReportRow[]): TestReportsPayload['summary'] {
  const completedRows = rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at));
  const inProgressCount = rows.filter(
    (r) => isInProgressStatus(r.status) && !r.completed_at,
  ).length;
  const scores = completedRows.map((r) => r.score);
  const uniqueStudents = new Set(rows.map((r) => r.user_id)).size;
  const passed = scores.filter((s) => s >= 40).length;

  return {
    total_attempts: rows.length,
    in_progress_count: inProgressCount,
    completed_count: completedRows.length,
    unique_students: uniqueStudents,
    avg_score: scores.length > 0 ? averageScorePercent(scores) : 0,
    pass_rate: scores.length > 0 ? roundRatePercent((passed / scores.length) * 100) : 0,
    highest_score: scores.length > 0 ? roundScorePercent(Math.max(...scores)) : 0,
  };
}

function statusTone(status: AdminTestOverviewItem['status']) {
  if (status === 'live') return 'success';
  if (status === 'upcoming') return 'warning';
  return 'danger';
}

function formatWhen(iso: string | null): string {
  return formatCollegeDateTime(iso);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr] py-2 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function deleteConfirmMessage(test: AdminTestOverviewItem): string {
  if (test.kind === 'faculty_schedule') {
    return `Delete schedule window "${test.title}"? The published exam stays unless you delete the full exam from Exam schedules.`;
  }
  if (test.kind === 'evalora_module') {
    return `Delete "${test.title}" from the student portal?`;
  }
  return `Delete "${test.title}" completely? This removes schedules, rosters, and attempts.`;
}

function AdminTestDetailModalContent({
  test,
  onOpenChange,
  onDeleted,
  scopeUserIds,
}: {
  test: AdminTestOverviewItem;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
  scopeUserIds?: string[];
}) {
  const [reportPayload, setReportPayload] = useState<TestReportsPayload | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const scorecardModal = useElevateXScorecardModal();
  const fromDashboard = isDashboardOverviewTest(test);

  const scopeSet = useMemo(
    () => (scopeUserIds?.length ? new Set(scopeUserIds) : null),
    [scopeUserIds],
  );

  const displayPayload = useMemo(() => {
    if (!reportPayload) return null;
    if (!scopeSet) return reportPayload;
    const rows = reportPayload.rows.filter((r) => scopeSet.has(r.user_id));
    return {
      ...reportPayload,
      rows,
      summary: computeSummaryFromRows(rows),
    };
  }, [reportPayload, scopeSet]);

  useEffect(() => {
    let cancelled = false;
    setReportPayload(null);
    setReportError(null);
    setReportLoading(true);

    const { examType, testId, scheduleId } = resolveReportFiltersForOverview(test);
    const q = new URLSearchParams({ examType });
    if (testId) q.set('testId', testId);
    if (scheduleId) q.set('scheduleId', scheduleId);

    fetchWithAuth(`/api/admin/test-reports?${q.toString()}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load test results');
        return (await res.json()) as TestReportsPayload;
      })
      .then((payload) => {
        if (!cancelled) setReportPayload(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setReportError(err instanceof Error ? err.message : 'Could not load test results');
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [test.id]);

  const stats = displayPayload?.summary;
  const rows = displayPayload?.rows ?? [];
  const studentsAttempted = stats?.unique_students ?? test.students_attempted;
  const studentsWriting = stats?.in_progress_count ?? test.students_writing ?? 0;
  const completedAttempts = stats?.completed_count ?? test.completed_attempts;
  const avgScore = stats?.avg_score ?? test.avg_score;
  const totalAttempts = stats?.total_attempts ?? test.total_attempts;
  const reportQuery = resolveReportFiltersForOverview(test);
  const examLabel = ADMIN_EXAM_TYPE_META[reportQuery.examType].label;
  const isElevateXReport = reportQuery.examType === 'elevatex';

  const openElevateXReport = (row: TestReportRow) => {
    void scorecardModal.open({
      attemptId: row.attempt_id,
      studentName: row.student_name,
      rollNumber: row.roll_number || undefined,
    });
  };

  const targetDepartments =
    test.departments.length > 0 ? test.departments.join(', ') : 'All departments';
  const targetYears = test.years.length > 0 ? test.years.join(', ') : 'All years';

  const deleteTest = async () => {
    if (!window.confirm(deleteConfirmMessage(test))) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/admin/tests-overview/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ overviewId: test.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        alert(json.error ?? 'Delete failed');
        return;
      }
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const downloadExamReportPdf = async () => {
    if (!displayPayload || rows.length === 0) {
      alert('No student attempts recorded for this exam yet.');
      return;
    }

    setDownloading('pdf');
    try {
      downloadTestReportPdf({
        examLabel,
        testName: test.title,
        scheduleLabel: fromDashboard
          ? 'Dashboard filters applied'
          : scheduleLabelForTestOverview(test),
        rows: displayPayload.rows,
        summary: displayPayload.summary,
      });
    } finally {
      setDownloading(null);
    }
  };

  const downloadExamReportCsv = () => {
    if (!displayPayload || rows.length === 0) {
      alert('No student attempts recorded for this exam yet.');
      return;
    }
    setDownloading('csv');
    try {
      downloadTestReportCsv(displayPayload, { testId: test.test_id ?? undefined, testName: test.title });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <DialogContent className="sm:max-w-2xl max-h-[min(calc(100dvh-2rem),800px)] overflow-y-auto overscroll-contain flex flex-col">
      <DialogHeader>
        <DialogTitle className="text-xl text-[#0c2340] pr-8">{test.title}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone="brand">{test.kind_label}</Badge>
          <Badge tone={statusTone(test.status)} className="capitalize">
            {test.status}
          </Badge>
          <span className="text-gray-500">{test.status_label}</span>
        </DialogDescription>
      </DialogHeader>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Writing now</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">
            {reportLoading ? '…' : studentsWriting}
          </p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Students attempted</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">
            {reportLoading ? '…' : studentsAttempted}
          </p>
        </div>
        <div className="rounded-lg border border-green-100 bg-green-50/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-green-700">Completed</p>
          <p className="mt-1 text-2xl font-bold text-green-900">
            {reportLoading ? '…' : completedAttempts}
          </p>
        </div>
        <div className="rounded-lg border border-orange-100 bg-orange-50/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Average score</p>
          <p className="mt-1 text-2xl font-bold text-orange-900">
            {reportLoading ? '…' : avgScore == null ? '—' : formatScorePercentLabel(avgScore)}
          </p>
        </div>
      </section>

      <dl className="mt-2">
        <DetailRow label="Schedule">
          {test.starts_at ? (
            <>
              {formatWhen(test.starts_at)}
              {test.ends_at ? ` → ${formatWhen(test.ends_at)}` : ''}
            </>
          ) : (
            'Not scheduled yet'
          )}
        </DetailRow>
        {test.duration_minutes ? (
          <DetailRow label="Duration">{test.duration_minutes} minutes</DetailRow>
        ) : null}
        {test.topic ? <DetailRow label="Topic">{test.topic}</DetailRow> : null}
        {test.faculty_department ? (
          <DetailRow label="Faculty dept">{test.faculty_department}</DetailRow>
        ) : null}
        {test.slot_number ? <DetailRow label="Slot">Slot {test.slot_number}</DetailRow> : null}
        <DetailRow label="Target departments">{targetDepartments}</DetailRow>
        <DetailRow label="Target years">{targetYears}</DetailRow>
        {test.notice ? <DetailRow label="Notice">{test.notice}</DetailRow> : null}
        {test.description ? <DetailRow label="Description">{test.description}</DetailRow> : null}
        {test.test_id ? (
          <DetailRow label="Test ID">
            <span className="font-mono text-xs">{test.test_id}</span>
          </DetailRow>
        ) : null}
      </dl>

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Student results
          {test.slot_number ? ` · Slot ${test.slot_number}` : ''}
        </h3>
        {reportLoading ? (
          <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 p-4 animate-pulse">
            Loading results for this test…
          </p>
        ) : reportError ? (
          <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 p-4">{reportError}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 p-4">
            No student attempts recorded for this slot yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Rank</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Student</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Roll</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Score</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Status</th>
                  {isElevateXReport ? (
                    <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Report</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const showReport =
                    isElevateXReport &&
                    isCompletedAttemptStatus(row.status, row.completed_at);
                  return (
                  <tr
                    key={row.attempt_id}
                    className={cn(
                      'border-b border-gray-100 last:border-0',
                      showReport && 'cursor-pointer hover:bg-gray-50',
                    )}
                    onClick={showReport ? () => openElevateXReport(row) : undefined}
                  >
                    <td className="py-2.5 px-3 font-semibold text-[#1e3a5f]">
                      {row.rank != null ? `#${row.rank}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-gray-900">{row.student_name}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">
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
                        <span className="text-gray-600">{row.roll_number || '—'}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#1e3a5f]">
                      {formatScorePercentLabel(row.score)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{formatAttemptStatus(row.status)}</td>
                    {isElevateXReport ? (
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {showReport ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={scorecardModal.loading}
                            onClick={() => openElevateXReport(row)}
                          >
                            Full report
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          className="bg-[#0c2340] hover:bg-[#16304f]"
          disabled={downloading !== null || reportLoading || totalAttempts === 0}
          onClick={() => void downloadExamReportPdf()}
        >
          {downloading === 'pdf'
            ? 'Preparing PDF…'
            : fromDashboard
              ? 'Download test report (PDF)'
              : 'Download slot report (PDF)'}
        </Button>
        <Button
          variant="outline"
          disabled={downloading !== null || reportLoading || totalAttempts === 0}
          onClick={downloadExamReportCsv}
        >
          {downloading === 'csv' ? 'Preparing CSV…' : 'Download report (CSV)'}
        </Button>
        <Button variant="outline" asChild>
          <Link
            href={`/admin/reports?type=${reportQuery.examType}${
              test.test_id ? `&testId=${encodeURIComponent(test.test_id)}` : ''
            }${reportQuery.scheduleId ? `&scheduleId=${encodeURIComponent(reportQuery.scheduleId)}` : ''}`}
          >
            Open full reports
          </Link>
        </Button>
        {!fromDashboard ? (
          <Button
            variant="outline"
            disabled={deleting}
            className="text-red-700 border-red-200 hover:bg-red-50"
            onClick={() => void deleteTest()}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        ) : null}
        {test.kind === 'faculty_published' || test.kind === 'faculty_schedule' ? (
          <Button variant="ghost" asChild>
            <Link href="/admin/exam-schedules">Exam schedules →</Link>
          </Button>
        ) : null}
      </div>
      <ElevateXScorecardReportModal
        open={scorecardModal.isOpen}
        onClose={scorecardModal.close}
        studentName={scorecardModal.target?.studentName ?? ''}
        rollNumber={scorecardModal.target?.rollNumber}
        scorecard={scorecardModal.scorecard}
        loading={scorecardModal.loading}
        loadError={scorecardModal.loadError}
      />
    </DialogContent>
  );
}

export function AdminTestDetailModal({
  test,
  open,
  onOpenChange,
  onDeleted,
  scopeUserIds,
}: AdminTestDetailModalProps) {
  if (!test) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminTestDetailModalContent
        key={`${test.id}:${scopeUserIds?.join(',') ?? ''}`}
        test={test}
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
        scopeUserIds={scopeUserIds}
      />
    </Dialog>
  );
}
