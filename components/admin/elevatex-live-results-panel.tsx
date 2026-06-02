'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatScorePercentLabel } from '@/lib/format-score';
import { PLACEMENT_SECTIONS } from '@/lib/placement/config';
import type { PlacementSectionId } from '@/lib/placement/types';
import { ElevateXScorecardView } from '@/components/placement/elevatex-scorecard-view';
import type { PlacementScorecard } from '@/lib/placement/types';
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

type Payload = {
  rows: ResultRow[];
  summary: { submitted_count: number; with_scorecard: number; avg_score: number };
  refreshed_at?: string;
};

const POLL_MS = 3000;

export function ElevateXLiveResultsPanel({ className }: { className?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<{
    row: ResultRow;
    scorecard: PlacementScorecard;
  } | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);

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

  const openScorecard = async (row: ResultRow) => {
    setScorecardLoading(true);
    try {
      const res = await fetch(`/api/admin/elevatex/scorecard/${encodeURIComponent(row.attempt_id)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        alert(json.error ?? 'Full report not available for this roll number.');
        return;
      }
      const json = (await res.json()) as { scorecard?: PlacementScorecard };
      if (json.scorecard) setScorecard({ row, scorecard: json.scorecard });
    } finally {
      setScorecardLoading(false);
    }
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
              {data?.summary.submitted_count ?? 0} submitted · avg{' '}
              {formatScorePercentLabel(data?.summary.avg_score ?? 0)} · section marks per roll
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>

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
                  <tr key={row.attempt_id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-mono font-semibold text-[#1e3a5f]">
                      {row.roll_number || '—'}
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
                    <td className="py-2 px-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-[#1e3a5f]"
                        disabled={scorecardLoading}
                        onClick={() => void openScorecard(row)}
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

      {scorecard ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal
        >
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-2xl">
            <div className="flex justify-end mb-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setScorecard(null)}>
                Close
              </Button>
            </div>
            <ElevateXScorecardView scorecard={scorecard.scorecard} />
          </div>
        </div>
      ) : null}
    </>
  );
}
