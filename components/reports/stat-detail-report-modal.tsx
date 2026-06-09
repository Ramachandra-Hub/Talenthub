'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FileSpreadsheet,
  FileText,
  Sparkles,
  Table2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  downloadTableReportExcel,
  downloadTableReportPdf,
  type TableReportPayload,
} from '@/lib/reports/table-report';

type StatDetailReportModalProps = {
  open: boolean;
  onClose: () => void;
  report: TableReportPayload | null;
  fileBase?: string;
  /** Optional controls shown below the header (e.g. date filter). */
  toolbar?: ReactNode;
};

function emptyReportPayload(): TableReportPayload {
  return {
    title: 'Loading report…',
    subtitle: 'Please wait',
    generatedAt: new Date().toLocaleString(),
    columns: [{ key: 'message', header: 'Status' }],
    rows: [{ message: 'Preparing report data…' }],
  };
}

export function StatDetailReportModal({
  open,
  onClose,
  report,
  fileBase,
  toolbar,
}: StatDetailReportModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) return null;

  const displayReport = report ?? emptyReportPayload();
  const base = fileBase ?? 'dashboard-report';
  const hasRows = displayReport.rows.length > 0;

  const modal = (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto overscroll-contain animate-in fade-in-0 duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stat-report-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-[#0a1628]/72 backdrop-blur-md cursor-default"
        aria-label="Close report"
        onClick={onClose}
      />

      <div className="flex min-h-full items-start sm:items-center justify-center p-3 sm:p-8">
      {/* Panel */}
      <div
        className="stat-report-modal-panel relative z-[1] my-auto flex w-full max-w-[min(96vw,72rem)] max-h-[min(calc(100dvh-1.5rem),920px)] flex-col overflow-hidden rounded-[1.35rem] border border-[#c4a052]/25 bg-white animate-in zoom-in-95 slide-in-from-bottom-4 fade-in-0 duration-300"
        style={{ boxShadow: 'var(--shadow-lux-lg), 0 0 0 1px rgba(196,160,82,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold accent rail */}
        <div
          className="absolute inset-x-0 top-0 h-[3px] z-20 bg-gradient-to-r from-transparent via-[#c4a052] to-transparent opacity-90"
          aria-hidden
        />

        {/* Header */}
        <header className="admin-modal-dark-header stat-report-modal-header relative shrink-0 overflow-hidden px-5 sm:px-8 pt-7 pb-6 text-white">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0c2340] via-[#1e3a5f] to-[#254d73]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                'radial-gradient(ellipse 70% 80% at 0% -20%, rgba(56,189,248,0.18), transparent 55%), radial-gradient(ellipse 50% 60% at 100% 120%, rgba(196,160,82,0.14), transparent 50%)',
            }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden />

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex gap-4">
              <div
                className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                aria-hidden
              >
                <Table2 className="h-6 w-6 text-[#e8d5a8]" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c4a052]/35 bg-[#c4a052]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#f0e6c8]">
                    <Sparkles className="h-3 w-3 text-[#c4a052]" aria-hidden />
                    Executive report
                  </span>
                  {hasRows ? (
                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/90 tabular-nums">
                      {displayReport.rows.length} record{displayReport.rows.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                <h2
                  id="stat-report-title"
                  className="text-xl sm:text-2xl font-semibold tracking-tight text-white truncate"
                >
                  {displayReport.title}
                </h2>
                {displayReport.subtitle ? (
                  <p className="text-sm text-white/80 mt-1.5 max-w-2xl leading-relaxed">
                    {displayReport.subtitle}
                  </p>
                ) : null}
                <p className="text-xs text-white/55 mt-2 font-medium tracking-wide">
                  Generated {displayReport.generatedAt}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0 lg:justify-end">
              <Button
                size="sm"
                className="h-9 gap-2 rounded-xl border border-emerald-400/30 bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-[0_4px_14px_rgba(5,150,105,0.35)] hover:from-emerald-400 hover:to-emerald-600 hover:shadow-[0_6px_20px_rgba(5,150,105,0.4)] transition-all duration-200"
                onClick={() => downloadTableReportExcel(displayReport, base)}
                disabled={!hasRows || !report}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Excel
              </Button>
              <Button
                size="sm"
                className="h-9 gap-2 rounded-xl border border-[#c4a052]/40 bg-gradient-to-b from-[#f8f4eb] to-[#e8dcc0] text-[#0c2340] shadow-[0_4px_14px_rgba(196,160,82,0.25)] hover:from-white hover:to-[#f0e6c8] transition-all duration-200 font-semibold"
                onClick={() => downloadTableReportPdf(displayReport, base)}
                disabled={!hasRows || !report}
              >
                <FileText className="h-4 w-4" aria-hidden />
                PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 rounded-xl border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white backdrop-blur-sm transition-all duration-200"
                onClick={onClose}
              >
                <X className="h-4 w-4" aria-hidden />
                Close
              </Button>
            </div>
          </div>
        </header>

        {toolbar ? (
          <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 sm:px-8 py-4">
            {toolbar}
          </div>
        ) : null}

        {/* Summary KPI strip */}
        {displayReport.summaryLines?.length ? (
          <div className="shrink-0 border-b border-slate-200/80 bg-gradient-to-b from-[#f8fafc] to-white px-5 sm:px-8 py-4">
            <div className="flex flex-wrap gap-3">
              {displayReport.summaryLines.map((line) => (
                <div
                  key={line}
                  className="flex min-w-[140px] flex-1 items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-lux)]"
                  style={{ borderLeftWidth: 3, borderLeftColor: 'var(--gold)' }}
                >
                  <span className="text-sm font-medium text-slate-700 leading-snug">{line}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Table body */}
        <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col bg-gradient-to-b from-slate-50/80 to-white">
          <div className="lux-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative flex-1 overflow-auto min-h-0 px-5 sm:px-8 py-5 overscroll-contain">
            {hasRows ? (
              <div className="rounded-2xl border border-slate-200/90 bg-white/95 overflow-x-auto overflow-y-visible shadow-[var(--shadow-lux)] backdrop-blur-sm">
                <table className="app-table w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {displayReport.columns.map((col) => (
                        <th
                          key={col.key}
                          className={
                            col.align === 'right'
                              ? 'text-right bg-[#1e3a5f]/[0.07]'
                              : col.align === 'center'
                                ? 'text-center bg-[#1e3a5f]/[0.07]'
                                : 'text-left bg-[#1e3a5f]/[0.07]'
                          }
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayReport.rows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                      >
                        {displayReport.columns.map((col) => (
                          <td
                            key={col.key}
                            className={
                              col.align === 'right'
                                ? 'text-right tabular-nums font-medium text-[#0c2340]'
                                : col.align === 'center'
                                  ? 'text-center'
                                  : ''
                            }
                          >
                            {String(row[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-lux)]">
                  <Table2 className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
                </div>
                <p className="text-base font-semibold text-[#0c2340]">No records yet</p>
                <p className="text-sm text-slate-500 mt-1 max-w-sm">
                  There is no data for this overview metric. Check back after students complete
                  related activity.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="shrink-0 border-t border-slate-200/80 bg-white/90 px-5 sm:px-8 py-3.5 backdrop-blur-sm">
            <div className="lux-divider mb-3 opacity-60" aria-hidden />
            <p className="text-xs text-slate-500 text-center sm:text-left">
              {hasRows ? (
                <>
                  Showing{' '}
                  <span className="font-semibold text-[#1e3a5f] tabular-nums">
                    {displayReport.rows.length}
                  </span>{' '}
                  row{displayReport.rows.length === 1 ? '' : 's'}. Scroll vertically and
                  horizontally if needed. Use{' '}
                  <span className="font-medium text-slate-600">Excel</span> or{' '}
                  <span className="font-medium text-slate-600">PDF</span> for a formatted export.
                </>
              ) : (
                'Exports unlock once records are available.'
              )}
            </p>
          </footer>
        </div>
      </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
