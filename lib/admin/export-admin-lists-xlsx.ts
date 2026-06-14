import * as XLSX from 'xlsx';
import { formatScorePercent } from '@/lib/format-score';

export type UserExportRow = {
  full_name: string | null;
  roll_number: string | null;
  branch: string | null;
  academic_year?: string | null;
  email: string;
  auto_submit_count?: number;
  zero_score_auto_submit_count?: number;
  has_auto_submit?: boolean;
  logged_in_with_auto_submit?: boolean;
  last_auto_submit_at?: string | null;
  best_score?: number;
  avg_score?: number;
  attempt_count?: number;
};

export type ProctoringExportRow = {
  created_at: string;
  roll_number: string | null;
  full_name: string | null;
  email: string | null;
  branch: string | null;
  violation_type: string;
  violation_count: number;
  attempt_violation_total: number;
  student_violation_total: number;
  test_id: string | null;
  attempt_id: string | null;
  auto_submitted: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function downloadFilteredUsersExcel(rows: UserExportRow[], label = 'students'): void {
  const sheetRows = rows.map((r) => ({
    Name: r.full_name?.trim() || '—',
    'Roll number': r.roll_number?.trim() || '—',
    Branch: r.branch?.trim() || '—',
    Year: r.academic_year?.trim() || '—',
    Email: r.email,
    'Auto-submitted': r.has_auto_submit ? 'Yes' : 'No',
    'Auto-submit count': r.auto_submit_count ?? 0,
    '0% auto-submit count': r.zero_score_auto_submit_count ?? 0,
    'Logged in (auto-submit)': r.logged_in_with_auto_submit ? 'Yes' : 'No',
    'Last auto-submit': r.last_auto_submit_at
      ? new Date(r.last_auto_submit_at).toLocaleString('en-IN')
      : '—',
    'Best score %': (r.attempt_count ?? 0) > 0 ? formatScorePercent(r.best_score) : '—',
    'Avg score %': (r.attempt_count ?? 0) > 0 ? formatScorePercent(r.avg_score) : '—',
    Attempts: r.attempt_count ?? 0,
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, `users-${slugify(label)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadProctoringExcel(rows: ProctoringExportRow[], label = 'proctoring'): void {
  const sheetRows = rows.map((r) => ({
    Time: new Date(r.created_at).toLocaleString('en-IN'),
    'Roll number': r.roll_number?.trim() || '—',
    Name: r.full_name?.trim() || '—',
    Email: r.email?.trim() || '—',
    Branch: r.branch?.trim() || '—',
    'Incident violations': r.violation_count,
    'Attempt total': r.attempt_violation_total,
    'Student total': r.student_violation_total,
    Type: r.violation_type.replace(/_/g, ' '),
    'Auto-submitted': r.auto_submitted ? 'Yes' : 'No',
    Test: r.test_id ?? '—',
    'Attempt ID': r.attempt_id ?? '—',
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proctoring');
  XLSX.writeFile(wb, `proctoring-${slugify(label)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
