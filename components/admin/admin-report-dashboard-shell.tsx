'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLLEGE } from '@/lib/college-brand';
import { cn } from '@/lib/utils';

export type ReportKpiTone = 'navy' | 'emerald' | 'slate' | 'amber' | 'cyan' | 'red';

export type ReportKpi = {
  label: string;
  value: string | number;
  tone: ReportKpiTone;
};

export type ReportTab = {
  id: string;
  label: string;
};

const KPI_TONES: Record<ReportKpiTone, string> = {
  navy: 'bg-[#0c2340] text-white',
  emerald: 'bg-emerald-600 text-white',
  slate: 'bg-slate-500 text-white',
  amber: 'bg-amber-500 text-white',
  cyan: 'bg-cyan-700 text-white',
  red: 'bg-rose-600 text-white',
};

type AdminReportDashboardShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  heroLabel: string;
  heroValue: string;
  heroHint?: string;
  kpis: ReportKpi[];
  tabs: ReportTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  overview: ReactNode;
  details: ReactNode;
  toolbar?: ReactNode;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
};

export function AdminReportDashboardShell({
  open,
  onClose,
  title,
  subtitle,
  heroLabel,
  heroValue,
  heroHint,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  overview,
  details,
  toolbar,
  onExportExcel,
  onExportPdf,
  exportDisabled,
}: AdminReportDashboardShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

  const modal = (
    <div
      className="fixed inset-0 z-[210] overflow-y-auto overscroll-contain animate-in fade-in-0 duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-report-dashboard-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-[#0a1628]/75 backdrop-blur-md cursor-default"
        aria-label="Close report"
        onClick={onClose}
      />

      <div className="flex min-h-full items-start sm:items-center justify-center p-3 sm:p-6">
        <div
          className="relative z-[1] my-auto w-full max-w-[min(96vw,56rem)] max-h-[min(calc(100dvh-1.5rem),900px)] flex flex-col overflow-hidden rounded-[1.5rem] border border-[#c4a052]/30 bg-[#f8fafc] shadow-[0_32px_80px_-12px_rgba(12,35,64,0.45)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="relative shrink-0 overflow-hidden px-6 sm:px-8 pt-8 pb-10 text-white">
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#0c2340] via-[#1e3a5f] to-[#0f4c5c]"
              aria-hidden
            />
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 90% 70% at 0% -10%, rgba(56,189,248,0.2), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(196,160,82,0.22), transparent 50%)',
              }}
              aria-hidden
            />
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c4a052] to-transparent" />

            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#e8d5a8]/90">
                  {COLLEGE.rce} · {COLLEGE.departmentTitle}
                </p>
                <h2 id="admin-report-dashboard-title" className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
                  {title}
                </h2>
                <p className="mt-1 text-sm text-white/80 max-w-xl">{subtitle}</p>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 backdrop-blur-sm text-center min-w-[140px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8d5a8]/90">
                    {heroLabel}
                  </p>
                  <p className="mt-1 text-4xl sm:text-5xl font-black tabular-nums text-white">{heroValue}</p>
                  {heroHint ? (
                    <p className="text-xs text-white/70 mt-1 tabular-nums">{heroHint}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {onExportExcel ? (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                      onClick={onExportExcel}
                      disabled={exportDisabled}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                  ) : null}
                  {onExportPdf ? (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 rounded-xl bg-[#f8f4eb] text-[#0c2340] hover:bg-white font-semibold"
                      onClick={onExportPdf}
                      disabled={exportDisabled}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                  ) : null}
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

          {toolbar ? (
            <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 sm:px-6 py-4">{toolbar}</div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-5">
            {kpis.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className={cn('rounded-xl px-4 py-3 shadow-sm', KPI_TONES[kpi.tone])}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-85">{kpi.label}</p>
                    <p className="text-2xl font-black tabular-nums mt-0.5">{kpi.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {tabs.length > 1 ? (
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                      activeTab === tab.id
                        ? 'bg-[#0c2340] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}

            {activeTab === 'overview' ? overview : details}
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
