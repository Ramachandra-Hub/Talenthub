'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatDetailReportModal } from '@/components/reports/stat-detail-report-modal';
import {
  buildAttendanceReportPayload,
  summarizeAttendanceDay,
} from '@/lib/admin/attendance-report';
import type {
  AdminDashboardAttempt,
  AdminDashboardStudent,
} from '@/lib/admin/dashboard-card-reports';
import {
  formatDateKeyLabel,
  getTodayDateKeyInIST,
} from '@/lib/admin/report-date-filter';
import { formatScorePercentLabel } from '@/lib/format-score';

type AdminAttendanceReportModalProps = {
  open: boolean;
  onClose: () => void;
  dateKey: string;
  onDateKeyChange: (dateKey: string) => void;
  students: AdminDashboardStudent[];
  attempts: AdminDashboardAttempt[];
};

export function AdminAttendanceReportModal({
  open,
  onClose,
  dateKey,
  onDateKeyChange,
  students,
  attempts,
}: AdminAttendanceReportModalProps) {
  const todayKey = getTodayDateKeyInIST();
  const [branchFilter, setBranchFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      set.add(s.branch?.trim() || '—');
    }
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [students]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      set.add(s.academic_year?.trim() || '—');
    }
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [students]);

  const summary = useMemo(
    () => {
      const scoped = students.filter((s) => {
        if (branchFilter !== 'all' && (s.branch || '—') !== branchFilter) return false;
        if (yearFilter !== 'all' && (s.academic_year || '—') !== yearFilter) return false;
        return true;
      });
      const ids = new Set(scoped.map((s) => s.id));
      const scopedAttempts = attempts.filter((a) => ids.has(String(a.user_id ?? '')));
      return summarizeAttendanceDay(dateKey, scoped, scopedAttempts);
    },
    [dateKey, students, attempts, branchFilter, yearFilter],
  );

  const report = useMemo(
    () =>
      buildAttendanceReportPayload(dateKey, students, attempts, {
        branch: branchFilter,
        year: yearFilter,
      }),
    [dateKey, students, attempts, branchFilter, yearFilter],
  );

  const shiftDate = (deltaDays: number) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return;
    const next = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
    onDateKeyChange(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(next),
    );
  };

  const toolbar = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Attendance date (IST)
          </label>
          <Input
            type="date"
            value={dateKey}
            max={todayKey}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onDateKeyChange(v);
            }}
            className="w-[11.5rem]"
          />
          <Button
            type="button"
            size="sm"
            variant={dateKey === todayKey ? 'default' : 'outline'}
            className={dateKey === todayKey ? 'bg-[#0c2340] hover:bg-[#16304f]' : ''}
            onClick={() => onDateKeyChange(todayKey)}
          >
            Today
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => shiftDate(-1)}>
            Previous day
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dateKey >= todayKey}
            onClick={() => shiftDate(1)}
          >
            Next day
          </Button>
        </div>
        <p className="text-sm text-slate-600 sm:ml-auto">
          <span className="font-semibold text-[#0c2340]">{formatDateKeyLabel(dateKey)}</span>
          {' · '}
          <span className="font-semibold text-emerald-700">
            {formatScorePercentLabel(summary.attendanceRate)} present
          </span>
          {' '}
          ({summary.attendedCount}/{summary.totalStudents})
        </p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Branch
        </label>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-[#0c2340] bg-white min-w-[10rem]"
        >
          {branchOptions.map((b) => (
            <option key={b} value={b}>
              {b === 'all' ? 'All branches' : b}
            </option>
          ))}
        </select>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 ml-2">
          Year
        </label>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-[#0c2340] bg-white min-w-[8rem]"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y === 'all' ? 'All years' : y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <StatDetailReportModal
      open={open}
      onClose={onClose}
      report={report}
      fileBase={`attendance-${dateKey}${branchFilter !== 'all' ? `-${branchFilter}` : ''}`}
      toolbar={toolbar}
    />
  );
}
