import { averageScorePercent, formatScorePercentLabel, roundRatePercent } from '@/lib/format-score';
import type { TableReportPayload } from '@/lib/reports/table-report';
import type { BarRow, PieSlice } from '@/components/admin/admin-report-charts';
import type { ReportKpi } from '@/components/admin/admin-report-dashboard-shell';
import {
  buildAdminDashboardCardReport,
  type AdminDashboardCardKey,
  type AdminDashboardReportContext,
  type AdminDashboardStudent,
} from '@/lib/admin/dashboard-card-reports';
import {
  STUDENT_SCORE_BANDS,
  studentsInScoreBand,
  type ScoreBandKey,
} from '@/lib/admin/score-band';

export type CardDashboardView = {
  title: string;
  subtitle: string;
  heroLabel: string;
  heroValue: string;
  heroHint?: string;
  kpis: ReportKpi[];
  pie?: { title: string; hint: string; data: PieSlice[]; colors?: string[] };
  barPrimary?: {
    title: string;
    hint: string;
    data: BarRow[];
    layout?: 'vertical' | 'horizontal';
    stacked?: boolean;
    primaryColor?: string;
  };
  barSecondary?: {
    title: string;
    hint: string;
    data: BarRow[];
    layout?: 'vertical' | 'horizontal';
    primaryColor?: string;
  };
  tableColumns: { key: string; header: string; align?: 'left' | 'right' | 'center' }[];
  tableRows: Array<Record<string, string | number>>;
  exportPayload: TableReportPayload;
  /** Click score-band charts to filter the student table. */
  enableScoreBandDrilldown?: boolean;
  scoreBandRolls?: Partial<Record<ScoreBandKey, string[]>>;
};

function scoreBandRollIndex(students: AdminDashboardStudent[]): Partial<Record<ScoreBandKey, string[]>> {
  const index: Partial<Record<ScoreBandKey, string[]>> = {};
  for (const band of STUDENT_SCORE_BANDS) {
    index[band.key] = studentsInScoreBand(students, band).flatMap((s) => {
      const keys = [s.roll_number?.trim(), s.id, s.full_name?.trim(), s.email?.trim()].filter(
        Boolean,
      ) as string[];
      return keys;
    });
  }
  return index;
}

function trunc(s: string, max = 18): string {
  const t = s.trim() || '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function studentsByBranch(students: AdminDashboardStudent[]): BarRow[] {
  const map = new Map<string, number>();
  for (const s of students) {
    const b = s.branch?.trim() || 'Unassigned';
    map.set(b, (map.get(b) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      shortLabel: trunc(label),
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

function studentsByYear(students: AdminDashboardStudent[]): BarRow[] {
  const map = new Map<string, number>();
  for (const s of students) {
    const y = s.academic_year?.trim() || 'Not set';
    map.set(y, (map.get(y) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({
      label: label === 'Not set' ? 'Not set' : `Year ${label}`,
      shortLabel: trunc(label === 'Not set' ? 'N/A' : label, 10),
      value,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function scoreBandPie(students: AdminDashboardStudent[]): PieSlice[] {
  const active = students.filter((s) => s.attempts > 0);
  return STUDENT_SCORE_BANDS.map((b) => ({
    name: b.key,
    label: b.shortLabel,
    value: active.filter((s) => s.avgScore >= b.min && s.avgScore < b.max).length,
  }));
}

function scoreBandBar(students: AdminDashboardStudent[]): BarRow[] {
  const active = students.filter((s) => s.attempts > 0);
  return STUDENT_SCORE_BANDS.map((b) => ({
    label: b.label,
    shortLabel: b.shortLabel,
    value: active.filter((s) => s.avgScore >= b.min && s.avgScore < b.max).length,
    bandKey: b.key,
  }));
}

function attemptsByCategory(ctx: AdminDashboardReportContext): BarRow[] {
  const map = new Map<string, number>();
  for (const a of ctx.attempts) {
    const testId = String(a.test_id ?? '');
    const cat = ctx.categoryNameByTestId.get(testId) || 'Other';
    map.set(cat, (map.get(cat) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, shortLabel: trunc(label), value }))
    .sort((a, b) => b.value - a.value);
}

function attemptsByTest(ctx: AdminDashboardReportContext, limit = 8): BarRow[] {
  const map = new Map<string, number>();
  for (const a of ctx.attempts) {
    const testId = String(a.test_id ?? '');
    const name = a.test_name || ctx.testsMap.get(testId)?.name || 'Test';
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, shortLabel: trunc(label, 16), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function attemptsLast7DaysBar(ctx: AdminDashboardReportContext): BarRow[] {
  const days: BarRow[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const short = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
    const count = ctx.attempts.filter((a) => {
      const created = a.created_at ? new Date(a.created_at) : null;
      if (!created) return false;
      const ck = created.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      return ck === key;
    }).length;
    days.push({ label: key, shortLabel: short, value: count });
  }
  return days;
}

function attemptCountDistribution(students: AdminDashboardStudent[]): BarRow[] {
  const buckets = [
    { label: '1 test', min: 1, max: 1 },
    { label: '2 tests', min: 2, max: 2 },
    { label: '3 tests', min: 3, max: 3 },
    { label: '4+ tests', min: 4, max: 999 },
  ];
  const active = students.filter((s) => s.attempts > 0);
  return buckets.map((b) => ({
    label: b.label,
    shortLabel: b.label,
    value: active.filter((s) => s.attempts >= b.min && s.attempts <= b.max).length,
  }));
}

function avgScoreByBranch(students: AdminDashboardStudent[]): BarRow[] {
  const map = new Map<string, { sum: number; n: number }>();
  for (const s of students.filter((x) => x.attempts > 0)) {
    const b = s.branch?.trim() || 'Unassigned';
    const row = map.get(b) ?? { sum: 0, n: 0 };
    row.sum += s.avgScore;
    row.n += 1;
    map.set(b, row);
  }
  return Array.from(map.entries())
    .map(([label, { sum, n }]) => ({
      label,
      shortLabel: trunc(label),
      value: Math.round(sum / n),
      hint: `Avg ${formatScorePercentLabel(sum / n)} (${n} students)`,
    }))
    .sort((a, b) => b.value - a.value);
}

function passFailPie(ctx: AdminDashboardReportContext): PieSlice[] {
  const passed = ctx.attempts.filter((a) => Number(a.score ?? 0) >= 40).length;
  const failed = ctx.attempts.length - passed;
  return [
    { name: 'passed', label: 'Passed (≥40%)', value: passed },
    { name: 'failed', label: 'Below 40%', value: failed },
  ];
}

function exportAndTable(
  key: AdminDashboardCardKey,
  ctx: AdminDashboardReportContext,
): Pick<CardDashboardView, 'exportPayload' | 'tableColumns' | 'tableRows'> | null {
  const exportPayload = buildAdminDashboardCardReport(key, ctx);
  if (!exportPayload) return null;
  return {
    exportPayload,
    tableColumns: exportPayload.columns,
    tableRows: exportPayload.rows,
  };
}

export function buildAdminCardDashboardView(
  key: AdminDashboardCardKey,
  ctx: AdminDashboardReportContext,
): CardDashboardView | null {
  const base = exportAndTable(key, ctx);
  if (!base) return null;

  const activeStudents = ctx.students.filter((s) => s.attempts > 0);
  const uniqueTests = new Set(ctx.attempts.map((a) => String(a.test_id ?? ''))).size;

  switch (key) {
    case 'registered_users':
      return {
        ...base,
        title: 'Registered students',
        subtitle: 'Complete roster with activity snapshot',
        heroLabel: 'Total registered',
        heroValue: String(ctx.stats.totalRegisteredUsers),
        heroHint: `${ctx.stats.totalStudentsAttended} already attempted tests`,
        kpis: [
          { label: 'Registered', value: ctx.stats.totalRegisteredUsers, tone: 'navy' },
          { label: 'With attempts', value: ctx.stats.totalStudentsAttended, tone: 'emerald' },
          { label: 'Inactive', value: ctx.inactiveCount, tone: 'slate' },
          { label: 'Branches', value: studentsByBranch(ctx.students).length, tone: 'cyan' },
        ],
        pie: {
          title: 'Activity split',
          hint: 'Students who started at least one test vs inactive',
          data: [
            { name: 'active', label: 'With attempts', value: ctx.stats.totalStudentsAttended },
            { name: 'inactive', label: 'No attempts', value: ctx.inactiveCount },
          ],
          colors: ['#10b981', '#94a3b8'],
        },
        barPrimary: {
          title: 'Students by branch',
          hint: 'Headcount per department',
          data: studentsByBranch(ctx.students),
          layout: 'horizontal',
        },
        barSecondary: {
          title: 'Students by year',
          hint: 'Academic year distribution',
          data: studentsByYear(ctx.students),
          primaryColor: '#059669',
        },
      };

    case 'students_with_attempts':
      return {
        ...base,
        title: 'Active students',
        subtitle: 'Learners who have submitted at least one test',
        heroLabel: 'Active learners',
        heroValue: String(ctx.stats.totalStudentsAttended),
        heroHint: `Avg ${formatScorePercentLabel(averageScorePercent(activeStudents.map((s) => s.avgScore)))}`,
        kpis: [
          { label: 'Active', value: ctx.stats.totalStudentsAttended, tone: 'emerald' },
          {
            label: 'Avg score',
            value: formatScorePercentLabel(
              averageScorePercent(activeStudents.map((s) => s.avgScore)),
            ),
            tone: 'navy',
          },
          {
            label: 'Highest avg',
            value: formatScorePercentLabel(
              activeStudents.length ? Math.max(...activeStudents.map((s) => s.highestScore)) : 0,
            ),
            tone: 'amber',
          },
          { label: 'Total attempts', value: ctx.stats.totalTestsSubmitted, tone: 'cyan' },
        ],
        pie: {
          title: 'Score bands',
          hint: 'Click a segment to list students in that band',
          data: scoreBandPie(ctx.students),
          colors: ['#10b981', '#22c55e', '#f59e0b', '#f43f5e'],
        },
        barPrimary: {
          title: 'Score distribution',
          hint: 'Click a bar to see matching students',
          data: scoreBandBar(ctx.students),
          primaryColor: '#1e3a5f',
        },
        enableScoreBandDrilldown: true,
        scoreBandRolls: scoreBandRollIndex(ctx.students),
        barSecondary: {
          title: 'Active students by branch',
          hint: 'Count per department',
          data: studentsByBranch(activeStudents),
          layout: 'horizontal',
          primaryColor: '#1e3a5f',
        },
      };

    case 'inactive_students':
      return {
        ...base,
        title: 'Inactive students',
        subtitle: 'Registered accounts with no test attempts yet',
        heroLabel: 'Not started',
        heroValue: String(ctx.inactiveCount),
        heroHint:
          ctx.stats.totalRegisteredUsers > 0
            ? `${roundRatePercent((ctx.inactiveCount / ctx.stats.totalRegisteredUsers) * 100)}% of roster`
            : undefined,
        kpis: [
          { label: 'Inactive', value: ctx.inactiveCount, tone: 'slate' },
          { label: 'Registered', value: ctx.stats.totalRegisteredUsers, tone: 'navy' },
          {
            label: 'Active',
            value: ctx.stats.totalStudentsAttended,
            tone: 'emerald',
          },
          {
            label: 'Branches affected',
            value: studentsByBranch(ctx.students.filter((s) => s.attempts === 0)).length,
            tone: 'amber',
          },
        ],
        pie: {
          title: 'Roster split',
          hint: 'Inactive vs students with attempts',
          data: [
            { name: 'inactive', label: 'Inactive', value: ctx.inactiveCount },
            { name: 'active', label: 'Active', value: ctx.stats.totalStudentsAttended },
          ],
        },
        barPrimary: {
          title: 'Inactive by branch',
          hint: 'Students who have not started any test',
          data: studentsByBranch(ctx.students.filter((s) => s.attempts === 0)),
          layout: 'horizontal',
          primaryColor: '#64748b',
        },
      };

    case 'low_performers': {
      const low = ctx.students.filter((s) => s.attempts > 0 && s.avgScore < 40);
      return {
        ...base,
        title: 'Students needing support',
        subtitle: 'Average score below 40% — intervention recommended',
        heroLabel: 'Need attention',
        heroValue: String(ctx.stats.lowPerformers),
        heroHint: low.length ? `Lowest avg ${formatScorePercentLabel(Math.min(...low.map((s) => s.avgScore)))}` : undefined,
        kpis: [
          { label: 'Students', value: low.length, tone: 'red' },
          {
            label: 'Avg (this group)',
            value: formatScorePercentLabel(
              low.length ? averageScorePercent(low.map((s) => s.avgScore)) : 0,
            ),
            tone: 'amber',
          },
          { label: 'Branches', value: studentsByBranch(low).length, tone: 'navy' },
          { label: 'Active roster', value: ctx.stats.totalStudentsAttended, tone: 'slate' },
        ],
        barPrimary: {
          title: 'Low performers by branch',
          hint: 'Where support is most needed',
          data: studentsByBranch(low),
          layout: 'horizontal',
          primaryColor: '#e11d48',
        },
      };
    }

    case 'tests_submitted':
      return {
        ...base,
        title: 'All test submissions',
        subtitle: 'Every recorded attempt in the current filter',
        heroLabel: 'Total attempts',
        heroValue: String(ctx.stats.totalTestsSubmitted),
        heroHint: `${activeStudents.length} unique students · ${uniqueTests} tests`,
        kpis: [
          { label: 'Attempts', value: ctx.stats.totalTestsSubmitted, tone: 'navy' },
          { label: 'Students', value: activeStudents.length, tone: 'emerald' },
          {
            label: 'Avg score',
            value: formatScorePercentLabel(ctx.overallAverageScore),
            tone: 'amber',
          },
          { label: 'Pass rate', value: formatScorePercentLabel(ctx.passRate), tone: 'cyan' },
        ],
        pie: {
          title: 'Pass vs fail',
          hint: 'Attempts at or above 40%',
          data: passFailPie(ctx),
          colors: ['#10b981', '#f43f5e'],
        },
        barPrimary: {
          title: 'Attempts by category',
          hint: 'Volume per exam family',
          data: attemptsByCategory(ctx),
        },
        barSecondary: {
          title: 'Top tests',
          hint: 'Most attempted tests',
          data: attemptsByTest(ctx),
          primaryColor: '#1e3a5f',
        },
      };

    case 'tests_last_7_days': {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = ctx.attempts.filter(
        (a) => new Date(a.created_at ?? 0).getTime() >= cutoff,
      );
      return {
        ...base,
        title: 'Last 7 days activity',
        subtitle: 'Recent submissions and daily trend',
        heroLabel: 'This week',
        heroValue: String(ctx.stats.testsLast7Days),
        heroHint: `${new Set(recent.map((a) => a.user_id)).size} students`,
        kpis: [
          { label: '7-day attempts', value: ctx.stats.testsLast7Days, tone: 'cyan' },
          {
            label: 'Avg score',
            value: formatScorePercentLabel(
              recent.length
                ? averageScorePercent(recent.map((a) => Number(a.score ?? 0)))
                : 0,
            ),
            tone: 'navy',
          },
          {
            label: 'Passed',
            value: recent.filter((a) => Number(a.score ?? 0) >= 40).length,
            tone: 'emerald',
          },
          { label: 'Categories', value: attemptsByCategory({ ...ctx, attempts: recent }).length, tone: 'amber' },
        ],
        barPrimary: {
          title: 'Daily submissions',
          hint: 'Attempts per day (IST)',
          data: attemptsLast7DaysBar(ctx),
          primaryColor: '#0891b2',
        },
        pie: {
          title: 'By category',
          hint: 'Share of last-7-day attempts',
          data: attemptsByCategory({ ...ctx, attempts: recent }).map((b) => ({
            name: b.shortLabel,
            label: b.label,
            value: b.value,
          })),
          colors: ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e'],
        },
      };
    }

    case 'psychometric': {
      const psych = ctx.attempts.filter((a) => {
        const testId = String(a.test_id ?? '');
        return ctx.categorySlugByTestId.get(testId) === 'psychometric';
      });
      return {
        ...base,
        title: 'Psychometric tests',
        subtitle: 'Pattern and visual reasoning submissions',
        heroLabel: 'Submissions',
        heroValue: String(ctx.stats.psychometricSubmitted),
        heroHint: `${new Set(psych.map((a) => a.user_id)).size} students`,
        kpis: [
          { label: 'Attempts', value: psych.length, tone: 'navy' },
          {
            label: 'Avg score',
            value: formatScorePercentLabel(
              psych.length ? averageScorePercent(psych.map((a) => Number(a.score ?? 0))) : 0,
            ),
            tone: 'emerald',
          },
          {
            label: 'Passed',
            value: psych.filter((a) => Number(a.score ?? 0) >= 40).length,
            tone: 'cyan',
          },
          {
            label: 'Students',
            value: new Set(psych.map((a) => a.user_id)).size,
            tone: 'amber',
          },
        ],
        pie: {
          title: 'Pass vs fail',
          hint: 'Psychometric attempts ≥ 40%',
          data: [
            {
              name: 'pass',
              label: 'Passed',
              value: psych.filter((a) => Number(a.score ?? 0) >= 40).length,
            },
            {
              name: 'fail',
              label: 'Below 40%',
              value: psych.filter((a) => Number(a.score ?? 0) < 40).length,
            },
          ],
        },
        barPrimary: {
          title: 'Scores distribution',
          hint: 'Attempts grouped by score band',
          data: [
            { label: '90+', shortLabel: '90+', value: psych.filter((a) => Number(a.score ?? 0) >= 90).length },
            { label: '75–89', shortLabel: '75–89', value: psych.filter((a) => Number(a.score ?? 0) >= 75 && Number(a.score ?? 0) < 90).length },
            { label: '40–74', shortLabel: '40–74', value: psych.filter((a) => Number(a.score ?? 0) >= 40 && Number(a.score ?? 0) < 75).length },
            { label: '<40', shortLabel: '<40', value: psych.filter((a) => Number(a.score ?? 0) < 40).length },
          ],
          primaryColor: '#6366f1',
        },
      };
    }

    case 'overall_average':
      return {
        ...base,
        title: 'Overall average score',
        subtitle: 'Student-level performance in the current filter',
        heroLabel: 'Mean score',
        heroValue: formatScorePercentLabel(ctx.overallAverageScore),
        heroHint: `${ctx.attempts.length} attempts · ${activeStudents.length} students`,
        kpis: [
          { label: 'Average', value: formatScorePercentLabel(ctx.overallAverageScore), tone: 'navy' },
          { label: 'Students', value: activeStudents.length, tone: 'emerald' },
          { label: 'Attempts', value: ctx.attempts.length, tone: 'cyan' },
          { label: 'Pass rate', value: formatScorePercentLabel(ctx.passRate), tone: 'amber' },
        ],
        pie: {
          title: 'Student score bands',
          hint: 'Click a segment to list students in that band',
          data: scoreBandPie(ctx.students),
          colors: ['#10b981', '#22c55e', '#f59e0b', '#f43f5e'],
        },
        barPrimary: {
          title: 'Score distribution',
          hint: 'Click a bar to see matching students',
          data: scoreBandBar(ctx.students),
          primaryColor: '#1e3a5f',
        },
        barSecondary: {
          title: 'Average by branch',
          hint: 'Mean student score per department',
          data: avgScoreByBranch(ctx.students),
          primaryColor: '#059669',
        },
        enableScoreBandDrilldown: true,
        scoreBandRolls: scoreBandRollIndex(ctx.students),
      };

    case 'pass_rate':
      return {
        ...base,
        title: 'Pass rate analysis',
        subtitle: 'Attempts scoring 40% or above',
        heroLabel: 'Pass rate',
        heroValue: formatScorePercentLabel(ctx.passRate),
        heroHint: `${ctx.passedCount} passed of ${ctx.attempts.length}`,
        kpis: [
          { label: 'Passed', value: ctx.passedCount, tone: 'emerald' },
          { label: 'Failed', value: ctx.attempts.length - ctx.passedCount, tone: 'red' },
          { label: 'Total', value: ctx.attempts.length, tone: 'navy' },
          { label: 'Avg score', value: formatScorePercentLabel(ctx.overallAverageScore), tone: 'amber' },
        ],
        pie: {
          title: 'Pass vs fail',
          hint: 'Share of all attempts',
          data: passFailPie(ctx),
          colors: ['#10b981', '#f43f5e'],
        },
        barPrimary: {
          title: 'Attempts by category',
          hint: 'Where passes and fails occur',
          data: attemptsByCategory(ctx),
        },
      };

    case 'avg_tests_per_student':
      return {
        ...base,
        title: 'Tests per student',
        subtitle: 'How often students engage with assessments',
        heroLabel: 'Avg tests / student',
        heroValue: String(ctx.stats.avgTestsPerStudent),
        heroHint: `${activeStudents.length} active students`,
        kpis: [
          { label: 'Average', value: ctx.stats.avgTestsPerStudent, tone: 'navy' },
          {
            label: 'Max attempts',
            value: activeStudents.length ? Math.max(...activeStudents.map((s) => s.attempts)) : 0,
            tone: 'emerald',
          },
          {
            label: 'Single attempt',
            value: activeStudents.filter((s) => s.attempts === 1).length,
            tone: 'amber',
          },
          {
            label: '4+ attempts',
            value: activeStudents.filter((s) => s.attempts >= 4).length,
            tone: 'cyan',
          },
        ],
        barPrimary: {
          title: 'Attempt count distribution',
          hint: 'How many tests each active student took',
          data: attemptCountDistribution(ctx.students),
          primaryColor: '#0891b2',
        },
        pie: {
          title: 'Engagement',
          hint: 'Single test vs multiple tests',
          data: [
            {
              name: 'once',
              label: 'One test only',
              value: activeStudents.filter((s) => s.attempts === 1).length,
            },
            {
              name: 'multi',
              label: 'Multiple tests',
              value: activeStudents.filter((s) => s.attempts > 1).length,
            },
          ],
        },
      };

    default:
      return {
        ...base,
        title: base.exportPayload.title,
        subtitle: base.exportPayload.subtitle ?? '',
        heroLabel: 'Summary',
        heroValue: String(base.tableRows.length),
        kpis: [],
      };
  }
}

export function buildScoreBandDashboardView(
  bandKey: ScoreBandKey,
  ctx: AdminDashboardReportContext,
): CardDashboardView | null {
  const band = STUDENT_SCORE_BANDS.find((b) => b.key === bandKey);
  if (!band) return null;

  const inBand = studentsInScoreBand(ctx.students, band);
  const exportPayload = buildAdminDashboardCardReport('overall_average', {
    ...ctx,
    students: inBand,
  });
  if (!exportPayload) return null;

  const avgInBand =
    inBand.length > 0 ? averageScorePercent(inBand.map((s) => s.avgScore)) : 0;

  return {
    title: band.label,
    subtitle: 'Students in this average-score band (current dashboard filters)',
    heroLabel: 'Students',
    heroValue: String(inBand.length),
    heroHint:
      inBand.length > 0
        ? `Band avg ${formatScorePercentLabel(avgInBand)}`
        : 'No students in this band',
    kpis: [
      { label: 'In band', value: inBand.length, tone: 'navy' },
      {
        label: 'Band avg',
        value: formatScorePercentLabel(avgInBand),
        tone: 'emerald',
      },
      { label: 'Branches', value: studentsByBranch(inBand).length, tone: 'amber' },
      {
        label: 'Of active',
        value:
          ctx.students.filter((s) => s.attempts > 0).length > 0
            ? `${roundRatePercent(
                (inBand.length / ctx.students.filter((s) => s.attempts > 0).length) * 100,
              )}%`
            : '0%',
        tone: 'cyan',
      },
    ],
    barPrimary: {
      title: 'By branch',
      hint: 'Students in this score band per department',
      data: studentsByBranch(inBand),
      layout: 'horizontal',
      primaryColor: '#1e3a5f',
    },
    tableColumns: exportPayload.columns,
    tableRows: exportPayload.rows,
    exportPayload: {
      ...exportPayload,
      title: `${band.label} — student list`,
      subtitle: 'Filtered by student average score band',
    },
    enableScoreBandDrilldown: false,
  };
}
