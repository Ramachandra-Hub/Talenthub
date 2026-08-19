import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import { formatScorePercent, formatScorePercentLabel } from '@/lib/format-score';
import { fetchElevateXScorecardForAdmin } from '@/lib/admin/fetch-elevatex-scorecard-client';
import type { TestReportRow } from '@/lib/admin/test-reports-data';
import { buildElevateXScorecardPdfBlob } from '@/lib/placement/elevatex-scorecard-pdf';
import type { PlacementScorecard } from '@/lib/placement/types';
import { codingRubricCsvHeaders, codingRubricCsvValues } from '@/lib/exam-v2/coding-rubric';

export type BulkIndividualFormat = 'pdf' | 'csv';

export type BulkIndividualExportOptions = {
  rows: TestReportRow[];
  format: BulkIndividualFormat;
  zipBaseName: string;
  onProgress?: (current: number, total: number, studentName: string) => void;
};

function slugify(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'student';
}

function fileStem(row: TestReportRow): string {
  const roll = row.roll_number?.trim();
  const name = slugify(row.student_name);
  return roll ? `${roll}_${name}` : name;
}

export function downloadGenericStudentReportPdf(row: TestReportRow): void {
  const blob = buildGenericAttemptPdfBlob(row);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileStem(row)}-exam-report.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildGenericAttemptPdfBlob(row: TestReportRow): Blob {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Student Exam Report', 14, 18);
  doc.setFontSize(10);
  doc.text(row.test_name, 14, 26);
  doc.text(`${row.student_name} · ${row.roll_number || '—'}`, 14, 32);
  doc.text(`Branch: ${row.branch ?? '—'} · Year: ${row.academic_year ?? '—'}`, 14, 38);
  doc.setFontSize(14);
  doc.text(`Score: ${formatScorePercentLabel(row.score)}`, 14, 50);
  doc.setFontSize(10);
  doc.text(`Status: ${row.status}`, 14, 58);
  if (row.completed_at) {
    doc.text(`Completed: ${new Date(row.completed_at).toLocaleString('en-IN')}`, 14, 64);
  }
  if (row.time_taken_sec != null) {
    doc.text(`Time taken: ${Math.max(1, Math.round(row.time_taken_sec / 60))} min`, 14, 70);
  }
  return doc.output('blob');
}

function buildGenericAttemptCsv(row: TestReportRow): string {
  const lines = [
    'Field,Value',
    `Student,${escapeCsv(row.student_name)}`,
    `Roll,${escapeCsv(row.roll_number)}`,
    `Email,${escapeCsv(row.email)}`,
    `Branch,${escapeCsv(row.branch ?? '')}`,
    `Year,${escapeCsv(row.academic_year ?? '')}`,
    `Test,${escapeCsv(row.test_name)}`,
    `Score %,${formatScorePercent(row.score)}`,
    `Status,${escapeCsv(row.status)}`,
    `Completed,${escapeCsv(row.completed_at ? new Date(row.completed_at).toLocaleString('en-IN') : '')}`,
    `Time (min),${row.time_taken_sec != null ? Math.round(row.time_taken_sec / 60) : ''}`,
  ];
  return lines.join('\n');
}

function buildElevateXScorecardCsv(scorecard: PlacementScorecard, row: TestReportRow): string {
  const rubricHeaders = codingRubricCsvHeaders();
  const rubricValues = codingRubricCsvValues(scorecard.codingAnalysis?.aggregate);
  const lines = [
    'Exam Individual Report',
    `Student,${escapeCsv(scorecard.candidate.fullName || row.student_name)}`,
    `Roll,${escapeCsv(scorecard.candidate.hallTicket || row.roll_number)}`,
    `Email,${escapeCsv(scorecard.candidate.email || row.email)}`,
    `Overall %,${formatScorePercent(scorecard.percentage)}`,
    `Marks,${scorecard.earnedMarks} / ${scorecard.totalMarks}`,
    `Coding total,${scorecard.codingAnalysis ? formatScorePercent(scorecard.codingAnalysis.aggregate.totalEarned) : '—'}`,
    `Readiness,${escapeCsv(scorecard.placementReadiness)}`,
    '',
    ['Parameter', 'Earned', 'Max'].join(','),
    ...(scorecard.codingAnalysis?.aggregate.parameters.map((p) =>
      [escapeCsv(p.label), formatScorePercent(p.earned), String(p.maxPoints)].join(','),
    ) ?? []),
    '',
    'Section,Earned,Max,%,Correct,Wrong,Skipped',
    ...scorecard.sections.map((s) =>
      [
        escapeCsv(s.name),
        formatScorePercent(s.earned),
        String(s.marks),
        formatScorePercent(s.percent),
        s.correct ?? '—',
        s.wrong ?? '—',
        s.skipped ?? '—',
      ].join(','),
    ),
    '',
    'Leaderboard coding columns',
    ['Student', 'Roll', 'Email', ...rubricHeaders, 'Coding Total', 'Overall %'].join(','),
    [
      escapeCsv(scorecard.candidate.fullName || row.student_name),
      escapeCsv(scorecard.candidate.hallTicket || row.roll_number),
      escapeCsv(scorecard.candidate.email || row.email),
      ...rubricValues,
      scorecard.codingAnalysis ? formatScorePercent(scorecard.codingAnalysis.aggregate.totalEarned) : '',
      formatScorePercent(scorecard.percentage),
    ].join(','),
  ];
  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ZIP of one PDF or CSV per completed student (ElevateX = section-wise scorecard when available). */
export async function downloadAllIndividualTestReportsZip(
  options: BulkIndividualExportOptions,
): Promise<{ filesAdded: number; skipped: number }> {
  const completed = options.rows.filter((r) =>
    isCompletedAttemptStatus(r.status, r.completed_at),
  );
  if (completed.length === 0) {
    throw new Error('No completed student attempts to export for this filter.');
  }

  const zip = new JSZip();
  let filesAdded = 0;
  let skipped = 0;
  const ext = options.format === 'pdf' ? 'pdf' : 'csv';

  for (let i = 0; i < completed.length; i++) {
    const row = completed[i]!;
    options.onProgress?.(i + 1, completed.length, row.student_name);

    try {
      const stem = fileStem(row);

      const result = await fetchElevateXScorecardForAdmin(row.attempt_id, {
        rollNumber: row.roll_number || undefined,
      });
      if ('error' in result) {
        if (options.format === 'pdf') {
          zip.file(`${stem}.pdf`, buildGenericAttemptPdfBlob(row));
        } else {
          zip.file(`${stem}.csv`, buildGenericAttemptCsv(row));
        }
      } else if (options.format === 'pdf') {
        zip.file(`${stem}.pdf`, await buildElevateXScorecardPdfBlob(result.scorecard));
      } else {
        zip.file(`${stem}.csv`, buildElevateXScorecardCsv(result.scorecard, row));
      }

      filesAdded += 1;
      await sleep(80);
    } catch {
      skipped += 1;
    }
  }

  if (filesAdded === 0) {
    throw new Error('Could not export any individual student reports. Try again or narrow the filter.');
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.zipBaseName}-individual-${options.format}-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return { filesAdded, skipped };
}
