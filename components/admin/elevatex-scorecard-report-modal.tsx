'use client';

import { Button } from '@/components/ui/button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ElevateXScorecardView } from '@/components/placement/elevatex-scorecard-view';
import { downloadElevateXScorecardPdf } from '@/lib/placement/elevatex-scorecard-pdf';
import type { PlacementScorecard } from '@/lib/placement/types';
import { AppModal, AppModalPanel } from '@/components/ui/app-modal';

export type ElevateXScorecardReportModalProps = {
  open: boolean;
  onClose: () => void;
  studentName: string;
  rollNumber?: string;
  scorecard: PlacementScorecard | null;
  loading?: boolean;
  loadError?: string | null;
};

export function ElevateXScorecardReportModal({
  open,
  onClose,
  studentName,
  rollNumber,
  scorecard,
  loading,
  loadError,
}: ElevateXScorecardReportModalProps) {
  if (!open) return null;

  const pdfName = `elevatex-${(rollNumber || studentName).replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;

  return (
    <AppModal open onClose={onClose} ariaLabel="Close student section report">
      <AppModalPanel maxWidthClass="max-w-5xl">
        <div className="shrink-0 border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              ElevateX · Section-wise full report
            </p>
            <h3 className="text-lg font-bold text-[#0c2340] truncate">{studentName}</h3>
            {rollNumber ? (
              <p className="text-sm text-slate-500 font-mono">{rollNumber}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {scorecard ? (
              <Button
                size="sm"
                className="bg-[#1e3a5f] hover:bg-[#16304f]"
                onClick={() => downloadElevateXScorecardPdf(scorecard, pdfName)}
              >
                Download PDF
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 min-h-0">
          {loading ? (
            <LoadingScreen message="Loading section-wise report…" className="min-h-[200px]" />
          ) : loadError ? (
            <p className="text-sm text-red-700 rounded-lg border border-red-200 bg-red-50 p-4">
              {loadError}
            </p>
          ) : scorecard ? (
            <ElevateXScorecardView scorecard={scorecard} compact />
          ) : (
            <p className="text-sm text-slate-600">No report data.</p>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  );
}
