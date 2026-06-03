'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatScorePercentLabel } from '@/lib/format-score';
import { PLACEMENT_SECTIONS } from '@/lib/placement/config';
import type { PlacementSectionId } from '@/lib/placement/types';
import { ElevateXScorecardReportModal } from '@/components/admin/elevatex-scorecard-report-modal';
import { useElevateXScorecardModal } from '@/hooks/use-elevatex-scorecard-modal';
import { cn } from '@/lib/utils';

type ResultRow = {
  attempt_id: string;
  roll_number: string;
  student_name: string;
  overall_score: number;
  earned_marks: number;
  total_marks: number;
  submitted_at: string | null;
  sections: Partial<
    Record<PlacementSectionId, { earned: number; marks: number; percent: number }>
  >;
  has_full_scorecard: boolean;
};

type InProgressRow = {
  attempt_id: string;
  roll_number: string;
  student_name: string;
  partial_score: number;
  status: string;
  updated_at: string;
};

type Payload = {
  rows: ResultRow[];
  in_progress?: InProgressRow[];
  summary: {
    submitted_count: number;
    in_progress_count?: number;
    with_scorecard: number;
    avg_score: number;
  };
  refreshed_at?: string;
};

const POLL_MS = 3000;

export function ElevateXLiveResultsPanel({ className }: { className?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scorecardModal = useElevateXScorecardModal();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/elevatex/results', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('Could not load ElevateX submissions');
        return;
      }
      const json = (await res.json()) as Payload;
      setData(json);
      setError(null);
    } catch {
      setError('Could not load ElevateX submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const openReport = (row: ResultRow) => {
    void scorecardModal.open({
      attemptId: row.attempt_id,
      studentName: row.student_name,
      rollNumber: row.roll_number || undefined,
    });
  };

  if (loading && !data) {
    return (
      <div className={cn('rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm', className)}>
        Loading ElevateX submissions…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800', className)}>
        {error}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-emerald-300/60 bg-white/95 shadow-sm overflow-hidden',
          className,
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/90 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
              ElevateX — submitted results
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {data?.summary.in_progress_count ?? 0} writing now · {data?.summary.submitted_count ?? 0}{' '}
              submitted · avg {formatScorePercentLabel(data?.summary.avg_score ?? 0)} · auto-refresh{' '}
              {POLL_MS / 1000}s · click roll or report for full section PDF
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>

        {(data?.in_progress?.length ?? 0) > 0 ? (
          <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
            <p className="text-xs font-semibold text-amber-950 mb-2">Writing now</p>
            <div className="flex flex-wrap gap-2">
              {data!.in_progress!.map((row) => (
                <span
                  key={row.attempt_id}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-950"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-mono">{row.roll_number}</span>
                  <span className="text-slate-600 truncate max-w-[8rem]">{row.student_name}</span>
                  {row.partial_score > 0 ? (
                    <span className="text-emerald-700">{formatScorePercentLabel(row.partial_score)}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto max-h-[min(70vh,520px)]">
          <table className="w-full text-xs sm:text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr>
                <th className="text-left py-2 px-3 font-semibold text-slate-700">Roll</th>
                <th className="text-left py-2 px-3 font-semibold text-slate-700">Name</th>
                <th className="text-right py-2 px-2 font-semibold text-slate-700">Total</th>
                {PLACEMENT_SECTIONS.map((s) => (
                  <th
                    key={s.id}
                    className="text-right py-2 px-2 font-semibold text-slate-600 whitespace-nowrap"
                    title={s.name}
                  >
                    {s.short}
                  </th>
                ))}
                <th className="text-right py-2 px-3 font-semibold text-slate-700">Report</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={PLACEMENT_SECTIONS.length + 4} className="py-8 text-center text-slate-500">
                    No ElevateX submissions recorded yet. They appear here within a few seconds of
                    student submit.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.attempt_id}
                    className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer"
                    onClick={() => openReport(row)}
                  >
                    <td className="py-2 px-3 font-mono font-semibold">
                      <button
                        type="button"
                        className="text-[#1e3a5f] underline-offset-2 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReport(row);
                        }}
                      >
                        {row.roll_number || '—'}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-slate-800 max-w-[10rem] truncate" title={row.student_name}>
                      {row.student_name}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-700">
                      {formatScorePercentLabel(row.overall_score)}
                      <span className="block text-[10px] font-normal text-slate-500">
                        {row.earned_marks}/{row.total_marks}
                      </span>
                    </td>
                    {PLACEMENT_SECTIONS.map((s) => {
                      const sec = row.sections[s.id];
                      return (
                        <td key={s.id} className="py-2 px-2 text-right text-slate-700 whitespace-nowrap">
                          {sec ? (
                            <>
                              <span className="font-medium">{sec.earned}</span>
                              <span className="text-slate-400">/{sec.marks}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-[#1e3a5f]"
                        disabled={scorecardModal.loading}
                        onClick={() => openReport(row)}
                      >
                        Full report
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
    </>
  );
}
