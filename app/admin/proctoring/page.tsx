'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { downloadProctoringExcel } from '@/lib/admin/export-admin-lists-xlsx';

const POLL_MS = 2000;

type ViolationRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  roll_number: string | null;
  branch: string | null;
  violation_type: string;
  test_id: string | null;
  attempt_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  violation_count: number;
  attempt_violation_total: number;
  student_violation_total: number;
  auto_submitted: boolean;
};

type Summary = {
  total?: number;
  byType?: Record<string, number>;
  studentsFlagged?: number;
  autoSubmits?: number;
};

function isAutoSubmitIncident(row: ViolationRow): boolean {
  if (row.auto_submitted) return true;
  const type = row.violation_type.toLowerCase();
  return type.includes('auto_submit');
}

function buildSummary(rows: ViolationRow[]): Summary {
  const byType = rows.reduce<Record<string, number>>((acc, row) => {
    const t = String(row.violation_type);
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: rows.length,
    byType,
    studentsFlagged: new Set(rows.map((r) => r.user_id)).size,
    autoSubmits: rows.filter((r) => isAutoSubmitIncident(r)).length,
  };
}

export default function AdminProctoringPage() {
  const [rows, setRows] = useState<ViolationRow[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [rollFilter, setRollFilter] = useState('');
  const [minViolations, setMinViolations] = useState('');
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'auto_submit'>('all');

  const filteredRows = useMemo(() => {
    let list = rows;
    if (incidentFilter === 'auto_submit') {
      list = list.filter(isAutoSubmitIncident);
    }

    const rollQ = rollFilter.trim().toLowerCase();
    if (rollQ) {
      list = list.filter((r) => {
        const roll = (r.roll_number ?? '').toLowerCase();
        const emailRoll = (r.email ?? '').split('@')[0]?.toLowerCase() ?? '';
        return roll.includes(rollQ) || emailRoll.includes(rollQ);
      });
    }

    const min = Number(minViolations.trim());
    if (Number.isFinite(min) && min > 0) {
      list = list.filter(
        (r) => r.violation_count >= min || r.attempt_violation_total >= min || r.student_violation_total >= min,
      );
    }

    const q = searchTerm.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const roll = (r.roll_number ?? '').toLowerCase();
      const name = (r.full_name ?? '').toLowerCase();
      const email = (r.email ?? '').toLowerCase();
      const emailRoll = email.split('@')[0] ?? '';
      return roll.includes(q) || name.includes(q) || email.includes(q) || emailRoll.includes(q);
    });
  }, [rows, searchTerm, rollFilter, minViolations, incidentFilter]);

  const filteredSummary = useMemo(() => {
    if (!searchTerm.trim() && !rollFilter.trim() && !minViolations.trim() && incidentFilter === 'all') {
      return summary;
    }
    return buildSummary(filteredRows);
  }, [filteredRows, searchTerm, rollFilter, minViolations, incidentFilter, summary]);

  const filtersActive =
    Boolean(searchTerm.trim()) ||
    Boolean(rollFilter.trim()) ||
    Boolean(minViolations.trim()) ||
    incidentFilter === 'auto_submit';

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/proctoring', { credentials: 'include' });
    if (res.ok) {
      const json = (await res.json()) as { violations?: ViolationRow[]; summary?: Summary };
      setRows(json.violations ?? []);
      setSummary(json.summary ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [live, load]);

  const handleDownloadExcel = () => {
    if (!filteredRows.length) return;
    const label =
      incidentFilter === 'auto_submit'
        ? 'auto-submit'
        : rollFilter.trim()
          ? `roll-${rollFilter.trim()}`
          : 'filtered';
    downloadProctoringExcel(
      filteredRows.map((r) => ({
        created_at: r.created_at,
        roll_number: r.roll_number,
        full_name: r.full_name,
        email: r.email,
        branch: r.branch,
        violation_type: r.violation_type,
        violation_count: r.violation_count,
        attempt_violation_total: r.attempt_violation_total,
        student_violation_total: r.student_violation_total,
        test_id: r.test_id,
        attempt_id: r.attempt_id,
        auto_submitted: r.auto_submitted,
      })),
      label,
    );
  };

  if (loading) {
    return <LoadingScreen message="Loading proctoring data…" className="min-h-[40vh]" />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Proctoring"
        description="Search by roll or name, filter by violation counts, and export auto-submit lists to Excel."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filteredRows.length === 0}
              onClick={handleDownloadExcel}
            >
              Download Excel ({filteredRows.length})
            </Button>
            <Button variant={live ? 'default' : 'outline'} size="sm" onClick={() => setLive((v) => !v)}>
              {live ? 'Live refresh on' : 'Live refresh off'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          placeholder="Search name or email…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Input
          placeholder="Filter roll number…"
          value={rollFilter}
          onChange={(e) => setRollFilter(e.target.value)}
        />
        <Input
          type="number"
          min={1}
          placeholder="Min violations (count)"
          value={minViolations}
          onChange={(e) => setMinViolations(e.target.value)}
        />
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={incidentFilter}
          onChange={(e) => setIncidentFilter(e.target.value as 'all' | 'auto_submit')}
        >
          <option value="all">All incidents</option>
          <option value="auto_submit">Auto-submits only</option>
        </select>
      </div>

      {filtersActive ? (
        <p className="text-sm text-muted-foreground">
          Showing {filteredRows.length} of {rows.length} incidents
        </p>
      ) : null}

      <div className="grid sm:grid-cols-4 gap-3">
        <Card className="p-4 lux-surface">
          <p className="text-xs text-muted-foreground uppercase">Total incidents</p>
          <p className="text-2xl font-bold">{filteredSummary.total ?? 0}</p>
        </Card>
        <Card className="p-4 lux-surface">
          <p className="text-xs text-muted-foreground uppercase">Students flagged</p>
          <p className="text-2xl font-bold">{filteredSummary.studentsFlagged ?? 0}</p>
        </Card>
        <Card className="p-4 lux-surface">
          <p className="text-xs text-muted-foreground uppercase">Auto-submits</p>
          <p className="text-2xl font-bold text-amber-700">
            {filteredSummary.autoSubmits ?? filteredSummary.byType?.auto_submit_violations ?? 0}
          </p>
        </Card>
        {Object.entries(filteredSummary.byType ?? {})
          .filter(([t]) => !['proctor_summary'].includes(t))
          .slice(0, 3)
          .map(([type, count]) => (
            <Card key={type} className="p-4 lux-surface">
              <p className="text-xs text-muted-foreground uppercase">{type.replace(/_/g, ' ')}</p>
              <p className="text-2xl font-bold">{count}</p>
            </Card>
          ))}
      </div>

      <Card className="lux-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Roll</th>
                <th className="text-left p-3">Student</th>
                <th className="text-left p-3">Branch</th>
                <th className="text-left p-3">Violations</th>
                <th className="text-left p-3">Attempt total</th>
                <th className="text-left p-3">Student total</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Test</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-sm font-medium whitespace-nowrap">
                    {r.roll_number || (r.email ? r.email.split('@')[0] : '—')}
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{r.full_name || r.email || '—'}</p>
                    {r.email ? <p className="text-xs text-muted-foreground">{r.email}</p> : null}
                  </td>
                  <td className="p-3 text-xs">{r.branch ?? '—'}</td>
                  <td className="p-3 text-sm font-semibold text-amber-800">{r.violation_count}</td>
                  <td className="p-3 text-sm font-medium">{r.attempt_violation_total}</td>
                  <td className="p-3 text-sm font-medium text-[#1e3a5f]">{r.student_violation_total}</td>
                  <td className="p-3">
                    <Badge tone={r.violation_type.includes('auto_submit') || r.auto_submitted ? 'danger' : 'warning'}>
                      {r.violation_type.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs">
                    {String(
                      (r.metadata?.testId as string | undefined) ??
                        r.test_id ??
                        '—',
                    )}
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {rows.length && filtersActive
                      ? 'No incidents match your filters.'
                      : 'No proctoring incidents yet. During ElevateX or faculty exams, tab-switch flags appear here within a few seconds.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
