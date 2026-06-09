import type { AdminDashboardStudent } from '@/lib/admin/dashboard-card-reports';

export type ScoreBandKey = 'excellent' | 'strong' | 'average' | 'support';

export type ScoreBandDef = {
  key: ScoreBandKey;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  tone: string;
};

export const STUDENT_SCORE_BANDS: ScoreBandDef[] = [
  {
    key: 'excellent',
    label: '90 - 100 (Excellent)',
    shortLabel: '90–100%',
    min: 90,
    max: 101,
    tone: 'text-emerald-700',
  },
  {
    key: 'strong',
    label: '75 - 89 (Strong)',
    shortLabel: '75–89%',
    min: 75,
    max: 90,
    tone: 'text-green-700',
  },
  {
    key: 'average',
    label: '40 - 74 (Average)',
    shortLabel: '40–74%',
    min: 40,
    max: 75,
    tone: 'text-amber-700',
  },
  {
    key: 'support',
    label: '0 - 39 (Needs support)',
    shortLabel: 'Below 40%',
    min: 0,
    max: 40,
    tone: 'text-red-700',
  },
];

export function scoreBandForAverage(avgScore: number): ScoreBandDef | null {
  return (
    STUDENT_SCORE_BANDS.find((b) => avgScore >= b.min && avgScore < b.max) ?? null
  );
}

export function studentMatchesScoreBand(
  student: AdminDashboardStudent,
  band: ScoreBandDef | ScoreBandKey,
): boolean {
  if (student.attempts <= 0) return false;
  const def = typeof band === 'string' ? STUDENT_SCORE_BANDS.find((b) => b.key === band) : band;
  if (!def) return false;
  return student.avgScore >= def.min && student.avgScore < def.max;
}

export function studentsInScoreBand(
  students: AdminDashboardStudent[],
  band: ScoreBandDef | ScoreBandKey,
): AdminDashboardStudent[] {
  return students.filter((s) => studentMatchesScoreBand(s, band));
}
