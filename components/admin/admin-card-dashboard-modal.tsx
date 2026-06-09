'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AdminReportDashboardShell } from '@/components/admin/admin-report-dashboard-shell';
import {
  ReportBarCard,
  ReportChartGrid,
  ReportDonutCard,
} from '@/components/admin/admin-report-charts';
import type { CardDashboardView } from '@/lib/admin/dashboard-card-analytics';
import {
  downloadTableReportExcel,
  downloadTableReportPdf,
} from '@/lib/reports/table-report';

type AdminCardDashboardModalProps = {
  open: boolean;
  onClose: () => void;
  view: CardDashboardView | null;
  fileBase?: string;
  toolbar?: React.ReactNode;
};

const TABS = [
  { id: 'overview', label: 'Charts & overview' },
  { id: 'details', label: 'Full data' },
] as const;

export function AdminCardDashboardModal({
  open,
  onClose,
  view,
  fileBase,
  toolbar,
}: AdminCardDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setActiveTab('overview');
      setSearch('');
    }
  }, [open, view?.title]);

  const filteredRows = useMemo(() => {
    if (!view) return [];
    const q = search.trim().toLowerCase();
    if (!q) return view.tableRows;
    return view.tableRows.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [view, search]);

  if (!view) {
    return (
      <AdminReportDashboardShell
        open={open}
        onClose={onClose}
        title="Loading report…"
        subtitle="Please wait"
        heroLabel="Status"
        heroValue="…"
        kpis={[]}
        tabs={TABS}
        activeTab="overview"
        onTabChange={setActiveTab}
        overview={<p className="text-sm text-slate-500 py-8 text-center">Preparing report data…</p>}
        details={<p className="text-sm text-slate-500 py-8 text-center">Preparing report data…</p>}
      />
    );
  }

  const base = fileBase ?? 'dashboard-report';
  const hasRows = view.tableRows.length > 0;

  const overview = (
    <ReportChartGrid>
      {view.pie ? (
        <ReportDonutCard
          title={view.pie.title}
          hint={view.pie.hint}
          data={view.pie.data}
          colors={view.pie.colors}
        />
      ) : null}
      {view.barPrimary ? (
        <ReportBarCard
          title={view.barPrimary.title}
          hint={view.barPrimary.hint}
          data={view.barPrimary.data}
          layout={view.barPrimary.layout}
          stacked={view.barPrimary.stacked}
          primaryColor={view.barPrimary.primaryColor}
        />
      ) : null}
      {view.barSecondary ? (
        <div className={view.pie && view.barPrimary ? 'lg:col-span-2' : ''}>
          <ReportBarCard
            title={view.barSecondary.title}
            hint={view.barSecondary.hint}
            data={view.barSecondary.data}
            layout={view.barSecondary.layout}
            primaryColor={view.barSecondary.primaryColor}
          />
        </div>
      ) : null}
      {!view.pie && !view.barPrimary && !view.barSecondary ? (
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Open the <strong>Full data</strong> tab for the detailed table and exports.
        </div>
      ) : null}
    </ReportChartGrid>
  );

  const details = (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search any column…"
          className="pl-9 h-9"
        />
      </div>
      <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[min(42vh,360px)] overflow-y-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-[#0c2340] text-white text-left">
              <tr>
                {view.tableColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-2.5 px-3 font-semibold ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={view.tableColumns.length} className="py-10 text-center text-slate-500">
                    {hasRows ? 'No rows match your search.' : 'No data for this report.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/80">
                    {view.tableColumns.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2 px-3 text-slate-700 ${
                          col.align === 'right'
                            ? 'text-right tabular-nums font-semibold'
                            : col.align === 'center'
                              ? 'text-center'
                              : ''
                        }`}
                      >
                        {row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Showing {filteredRows.length} of {view.tableRows.length} row
        {view.tableRows.length === 1 ? '' : 's'}
      </p>
    </div>
  );

  return (
    <AdminReportDashboardShell
      open={open}
      onClose={onClose}
      title={view.title}
      subtitle={view.subtitle}
      heroLabel={view.heroLabel}
      heroValue={view.heroValue}
      heroHint={view.heroHint}
      kpis={view.kpis}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      toolbar={toolbar}
      overview={overview}
      details={details}
      exportDisabled={!hasRows}
      onExportExcel={() => downloadTableReportExcel(view.exportPayload, base)}
      onExportPdf={() => downloadTableReportPdf(view.exportPayload, base)}
    />
  );
}
