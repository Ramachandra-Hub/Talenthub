import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatAttemptStatus, isCompletedAttemptStatus } from '@/lib/attempt-status';
import { fetchElevateXScorecardForAdmin } from '@/lib/admin/fetch-elevatex-scorecard-client';
import { formatScorePercent, formatScorePercentLabel } from '@/lib/format-score';
import { codingRubricCsvHeaders, codingRubricCsvValues } from '@/lib/exam-v2/coding-rubric';
import type { TestReportRow, TestReportsPayload } from '@/lib/admin/test-reports-data';
import { sortTestReportRows } from '@/lib/admin/schedule-report-filter';
import type { PlacementScorecard } from '@/lib/placement/types';

export type ConsolidatedReportOptions = {
  examLabel: string;
  testName?: string;
  scheduleLabel?: string;
  dateRangeLabel?: string;
  rows: TestReportRow[];
  summary?: TestReportsPayload['summary'];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Medal / shortlist label for ranked leaderboard exports. */
export function rankTierLabel(rank: number | undefined): string {
  if (rank == null || rank < 1) return '—';
  if (rank === 1) return 'Gold';
  if (rank === 2) return 'Silver';
  if (rank === 3) return 'Bronze';
  if (rank <= 100) return 'Top 100';
  if (rank <= 200) return 'Top 200';
  return '—';
}

export function rankedCompletedRows(rows: TestReportRow[]): TestReportRow[] {
  return sortTestReportRows(rows).filter((r) =>
    isCompletedAttemptStatus(r.status, r.completed_at),
  );
}

function reportFileBase(options: ConsolidatedReportOptions): string {
  const namePart = options.testName ? slugify(options.testName) : slugify(options.examLabel);
  const slotPart =
    options.rows[0]?.slot_number != null ? `-slot-${options.rows[0].slot_number}` : '';
  const rangePart = options.dateRangeLabel
    ? `-${slugify(options.dateRangeLabel)}`
    : `-${new Date().toISOString().slice(0, 10)}`;
  return `exam-leaderboard-${namePart}${slotPart}${rangePart}`;
}

const SHEET_HEADERS = [
  'Rank',
  'Tier',
  'Student',
  'Roll',
  'Email',
  'Branch',
  'Year',
  'Test',
  'Score %',
  ...codingRubricCsvHeaders(),
  'Coding Total',
  'Status',
  'Completed (IST)',
  'Time (min)',
] as const;

function sheetRow(row: TestReportRow, scorecard?: PlacementScorecard | null): (string | number)[] {
  const rubric = scorecard?.codingAnalysis?.aggregate;
  return [
    row.rank ?? '—',
    rankTierLabel(row.rank),
    row.student_name,
    row.roll_number || '—',
    scorecard?.candidate.email || row.email || '—',
    row.branch ?? '—',
    row.academic_year ?? '—',
    row.test_name,
    formatScorePercentLabel(row.score),
    ...codingRubricCsvValues(rubric),
    rubric ? formatScorePercent(rubric.totalEarned) : '—',
    formatAttemptStatus(row.status),
    row.completed_at ? new Date(row.completed_at).toLocaleString('en-IN') : '—',
    row.time_taken_sec != null ? Math.max(1, Math.round(row.time_taken_sec / 60)) : '—',
  ];
}

function buildSheetAoA(rows: TestReportRow[], scorecards?: Map<string, PlacementScorecard>): (string | number)[][] {
  return [[...SHEET_HEADERS], ...rows.map((row) => sheetRow(row, scorecards?.get(row.attempt_id)))];
}

/** Ranked leaderboard PDF — highest score first, with tier column for winners / top 100 / top 200. */
export function downloadConsolidatedTestReportPdf(options: ConsolidatedReportOptions): void {
  const ranked = rankedCompletedRows(options.rows);
  const generatedAt = new Date().toLocaleString('en-IN');
  const doc = new jsPDF({ orientation: ranked.length > 20 ? 'landscape' : 'portrait' });
  const margin = 14;
  let y = 18;

  doc.setFontSize(18);
  doc.setTextColor(12, 35, 64);
  doc.text('Exam Leaderboard — Consolidated Report', margin, y);

  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  y += 8;
  doc.text(options.examLabel, margin, y);
  y += 6;
  if (options.testName) {
    doc.text(`Exam: ${options.testName}`, margin, y);
    y += 6;
  }
  if (options.scheduleLabel) {
    doc.text(`Schedule: ${options.scheduleLabel}`, margin, y);
    y += 6;
  }
  if (options.dateRangeLabel) {
    doc.text(`Date range (IST): ${options.dateRangeLabel}`, margin, y);
    y += 6;
  }
  doc.text(`Generated: ${generatedAt} · ${ranked.length} completed students`, margin, y);
  y += 6;
  doc.text('Sorted highest → lowest · Gold / Silver / Bronze · Top 100 · Top 200', margin, y);
  y += 10;

  if (ranked.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('No completed attempts for this filter.', margin, y);
    doc.save(`${reportFileBase(options)}.pdf`);
    return;
  }

  const top3 = ranked.filter((r) => r.rank != null && r.rank <= 3);
  if (top3.length) {
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Winners', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Rank', 'Tier', 'Student', 'Roll', 'Branch', 'Score']],
      body: top3.map((row) => [
        String(row.rank),
        rankTierLabel(row.rank),
        row.student_name,
        row.roll_number || '—',
        row.email || '—',
        row.branch ?? '—',
        formatScorePercentLabel(row.score),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [196, 160, 82] },
      theme: 'grid',
      margin: { left: margin, right: margin },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  doc.setFontSize(12);
  doc.text(`Full ranking (${ranked.length} students)`, margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [SHEET_HEADERS.slice()],
    body: ranked.map((row) => sheetRow(row)),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [12, 35, 64], fontSize: 7 },
    theme: 'striped',
    margin: { left: margin, right: margin },
  });

  doc.save(`${reportFileBase(options)}.pdf`);
}

/** Multi-sheet Excel: All ranked, Winners, Top 100, Top 200 — includes coding rubric columns when available. */
export async function downloadConsolidatedTestReportExcel(
  options: ConsolidatedReportOptions,
): Promise<void> {
  const ranked = rankedCompletedRows(options.rows);
  const scorecards = new Map<string, PlacementScorecard>();
  for (const row of ranked) {
    try {
      const result = await fetchElevateXScorecardForAdmin(row.attempt_id, {
        rollNumber: row.roll_number || undefined,
      });
      if (!('error' in result)) scorecards.set(row.attempt_id, result.scorecard);
    } catch {
      /* keep row without rubric */
    }
  }

  const base = reportFileBase(options);
  const meta = [
    ['Exam Leaderboard — Consolidated Report'],
    [options.examLabel],
    ...(options.testName ? [[`Exam: ${options.testName}`]] : []),
    ...(options.scheduleLabel ? [[`Schedule: ${options.scheduleLabel}`]] : []),
    ...(options.dateRangeLabel ? [[`Date range (IST): ${options.dateRangeLabel}`]] : []),
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [`Completed students: ${ranked.length}`],
    [],
  ];

  const wb = XLSX.utils.book_new();

  const allSheet = XLSX.utils.aoa_to_sheet([...meta, ...buildSheetAoA(ranked, scorecards)]);
  XLSX.utils.book_append_sheet(wb, allSheet, 'All ranked');

  const winners = ranked.filter((r) => r.rank != null && r.rank <= 3);
  if (winners.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(buildSheetAoA(winners, scorecards)),
      'Winners',
    );
  }

  const top100 = ranked.filter((r) => r.rank != null && r.rank <= 100);
  if (top100.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(buildSheetAoA(top100, scorecards)),
      'Top 100',
    );
  }

  const top200 = ranked.filter((r) => r.rank != null && r.rank <= 200);
  if (top200.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(buildSheetAoA(top200, scorecards)),
      'Top 200',
    );
  }

  XLSX.writeFile(wb, `${base}.xlsx`);
}
