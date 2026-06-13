import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatScorePercent, formatScorePercentLabel } from '@/lib/format-score';
import { findDepartment } from '@/lib/placement/config';
import type { PlacementScorecard } from '@/lib/placement/types';

function formatHms(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Build the scorecard PDF document (caller saves or zips the output). */
export function buildElevateXScorecardPdfDoc(scorecard: PlacementScorecard): jsPDF {
  const dept = findDepartment(scorecard.candidate.departmentId);
  const doc = new jsPDF();
  const hall = scorecard.candidate.hallTicket;

  doc.setFontSize(16);
  doc.text('ElevateX Scorecard', 14, 18);
  doc.setFontSize(10);
  doc.text(scorecard.candidate.collegeName ?? 'Campus Assessment', 14, 26);
  doc.text(`${scorecard.candidate.fullName} · ${hall} · ${dept?.name ?? 'Department'}`, 14, 32);
  doc.text(
    `Completed ${new Date(scorecard.completedAt).toLocaleString()} · ${formatHms(scorecard.totalElapsedSec)}`,
    14,
    38,
  );

  doc.setFontSize(12);
  doc.text(`Overall: ${formatScorePercentLabel(scorecard.percentage)}`, 14, 48);
  doc.setFontSize(10);
  doc.text(
    `${scorecard.earnedMarks} / ${scorecard.totalMarks} marks · Readiness: ${scorecard.placementReadiness}`,
    14,
    54,
  );
  doc.text(
    `Technical ${formatScorePercentLabel(scorecard.technicalRating)} · Communication ${formatScorePercentLabel(scorecard.communicationRating)} · Employability ${formatScorePercent(scorecard.employabilityScore)}`,
    14,
    60,
  );

  autoTable(doc, {
    startY: 68,
    head: [['Section', 'Earned', 'Max', '%', 'Correct', 'Wrong', 'Skipped']],
    body: scorecard.sections.map((s) => [
      s.name,
      formatScorePercent(s.earned),
      String(s.marks),
      formatScorePercentLabel(s.percent),
      s.correct != null ? String(s.correct) : '—',
      s.wrong != null ? String(s.wrong) : '—',
      s.skipped != null ? String(s.skipped) : '—',
    ]),
    styles: { fontSize: 8 },
  });

  let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  y += 10;

  if (scorecard.strengths.length) {
    doc.setFontSize(11);
    doc.text('Strengths', 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const s of scorecard.strengths) {
      doc.text(`• ${s}`, 14, y, { maxWidth: 180 });
      y += 6;
    }
    y += 4;
  }

  if (scorecard.weaknesses.length) {
    doc.setFontSize(11);
    doc.text('Areas to improve', 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const s of scorecard.weaknesses) {
      doc.text(`• ${s}`, 14, y, { maxWidth: 180 });
      y += 6;
    }
    y += 4;
  }

  if (scorecard.recommendations.length) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.text('AI recommendations', 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const r of scorecard.recommendations) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(`• ${r}`, 14, y, { maxWidth: 180 });
      y += 8;
    }
  }

  return doc;
}

export function buildElevateXScorecardPdfBlob(scorecard: PlacementScorecard): Blob {
  return buildElevateXScorecardPdfDoc(scorecard).output('blob');
}

export function downloadElevateXScorecardPdf(
  scorecard: PlacementScorecard,
  fileName?: string,
): void {
  const hall = scorecard.candidate.hallTicket;
  const safeName = (scorecard.candidate.fullName || hall).replace(/[^a-zA-Z0-9_-]+/g, '_');
  buildElevateXScorecardPdfDoc(scorecard).save(fileName ?? `elevatex-scorecard-${safeName}-${hall}.pdf`);
}
