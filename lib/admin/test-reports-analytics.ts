import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import { averageScorePercent, formatScorePercentLabel } from '@/lib/format-score';
import type { BarRow, PieSlice } from '@/components/admin/admin-report-charts';
import type { ReportKpi } from '@/components/admin/admin-report-dashboard-shell';
import type { CardDashboardView } from '@/lib/admin/dashboard-card-analytics';
import {
  buildTestReportsCardReport,
  type TestReportsCardKey,
  type TestReportsReportContext,
} from '@/lib/admin/test-reports-card-reports';
import type { TestReportRow } from '@/lib/admin/test-reports-data';

function trunc(s: string, max = 18): string {
  const t = s.trim() || '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function countByField(rows: TestReportRow[], field: 'branch' | 'test_name', fallback: string): BarRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key =
      field === 'branch'
        ? r.branch?.trim() || fallback
        : r.test_name?.trim() || fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, shortLabel: trunc(label), value }))
    .sort((a, b) => b.value - a.value);
}

function scoreBandBar(rows: TestReportRow[]): BarRow[] {
  return [
    { label: '90+', shortLabel: '90+', value: rows.filter((r) => r.score >= 90).length },
    {
      label: '75–89',
      shortLabel: '75–89',
      value: rows.filter((r) => r.score >= 75 && r.score < 90).length,
    },
    {
      label: '40–74',
      shortLabel: '40–74',
      value: rows.filter((r) => r.score >= 40 && r.score < 75).length,
    },
    { label: '<40', shortLabel: '<40', value: rows.filter((r) => r.score < 40).length },
  ];
}

function statusPie(rows: TestReportRow[]): PieSlice[] {
  const inProg = rows.filter((r) => isInProgressStatus(r.status) && !r.completed_at).length;
  const done = rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at)).length;
  return [
    { name: 'completed', label: 'Completed', value: done },
    { name: 'in_progress', label: 'In progress', value: inProg },
  ];
}

function passFailPie(rows: TestReportRow[]): PieSlice[] {
  const passed = rows.filter((r) => r.score >= 40).length;
  return [
    { name: 'passed', label: 'Passed (≥40%)', value: passed },
    { name: 'failed', label: 'Below 40%', value: rows.length - passed },
  ];
}

function topScoresBar(rows: TestReportRow[], limit = 8): BarRow[] {
  return [...rows]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      label: r.student_name,
      shortLabel: trunc(r.student_name, 14),
      value: Math.round(r.score),
      hint: `${r.student_name} · ${r.test_name}`,
    }));
}

function avgByBranch(rows: TestReportRow[]): BarRow[] {
  const map = new Map<string, { sum: number; n: number }>();
  for (const r of rows.filter((x) => x.score > 0)) {
    const b = r.branch?.trim() || 'Unassigned';
    const row = map.get(b) ?? { sum: 0, n: 0 };
    row.sum += r.score;
    row.n += 1;
    map.set(b, row);
  }
  return Array.from(map.entries())
    .map(([label, { sum, n }]) => ({
      label,
      shortLabel: trunc(label),
      value: Math.round(sum / n),
      hint: `Avg ${formatScorePercentLabel(sum / n)} (${n})`,
    }))
    .sort((a, b) => b.value - a.value);
}

function uniqueStudentsByBranch(rows: TestReportRow[]): BarRow[] {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const b = r.branch?.trim() || 'Unassigned';
    if (!map.has(b)) map.set(b, new Set());
    map.get(b)!.add(r.user_id);
  }
  return Array.from(map.entries())
    .map(([label, ids]) => ({ label, shortLabel: trunc(label), value: ids.size }))
    .sort((a, b) => b.value - a.value);
}

function buildView(
  key: TestReportsCardKey,
  ctx: TestReportsReportContext,
  meta: {
    title: string;
    subtitle: string;
    heroLabel: string;
    heroValue: string;
    heroHint?: string;
    kpis: ReportKpi[];
    pie?: CardDashboardView['pie'];
    barPrimary?: CardDashboardView['barPrimary'];
    barSecondary?: CardDashboardView['barSecondary'];
  },
): CardDashboardView {
  const exportPayload = buildTestReportsCardReport(key, ctx);
  return {
    ...meta,
    tableColumns: exportPayload.columns,
    tableRows: exportPayload.rows,
    exportPayload,
  };
}

export function buildTestReportsCardDashboardView(
  key: TestReportsCardKey,
  ctx: TestReportsReportContext,
): CardDashboardView | null {
  const { payload } = ctx;
  const { summary, rows } = payload;
  const completed = rows.filter((r) => isCompletedAttemptStatus(r.status, r.completed_at));
  const inProgress = rows.filter((r) => isInProgressStatus(r.status) && !r.completed_at);

  switch (key) {
    case 'total_attempts':
      return buildView(key, ctx, {
        title: 'All attempts',
        subtitle: `${ctx.examLabel}${ctx.testFilterLabel ? ` · ${ctx.testFilterLabel}` : ''}`,
        heroLabel: 'Total attempts',
        heroValue: String(summary.total_attempts),
        heroHint: `${summary.unique_students} students · ${summary.completed_count} completed`,
        kpis: [
          { label: 'Attempts', value: summary.total_attempts, tone: 'navy' },
          { label: 'Completed', value: summary.completed_count, tone: 'emerald' },
          { label: 'In progress', value: summary.in_progress_count, tone: 'cyan' },
          { label: 'Students', value: summary.unique_students, tone: 'amber' },
        ],
        pie: {
          title: 'Status split',
          hint: 'Completed vs still in progress',
          data: statusPie(rows),
          colors: ['#10b981', '#0ea5e9'],
        },
        barPrimary: {
          title: 'Attempts by test',
          hint: 'Volume per test in this report',
          data: countByField(rows, 'test_name', 'Unknown'),
        },
        barSecondary: {
          title: 'Attempts by branch',
          hint: 'Department-wise attempt count',
          data: countByField(rows, 'branch', 'Unassigned'),
          layout: 'horizontal',
          primaryColor: '#1e3a5f',
        },
      });

    case 'in_progress':
      return buildView(key, ctx, {
        title: 'Live & in-progress',
        subtitle: 'Attempts started but not yet submitted',
        heroLabel: 'In progress',
        heroValue: String(summary.in_progress_count),
        heroHint:
          summary.total_attempts > 0
            ? `${Math.round((summary.in_progress_count / summary.total_attempts) * 100)}% of all attempts`
            : undefined,
        kpis: [
          { label: 'In progress', value: inProgress.length, tone: 'cyan' },
          {
            label: 'Avg live score',
            value: formatScorePercentLabel(
              inProgress.length
                ? averageScorePercent(inProgress.map((r) => r.score))
                : 0,
            ),
            tone: 'navy',
          },
          { label: 'Students', value: new Set(inProgress.map((r) => r.user_id)).size, tone: 'emerald' },
          { label: 'Tests', value: new Set(inProgress.map((r) => r.test_id)).size, tone: 'amber' },
        ],
        pie: {
          title: 'By test',
          hint: 'Where students are still writing',
          data: countByField(inProgress, 'test_name', 'Unknown').map((b) => ({
            name: b.shortLabel,
            label: b.label,
            value: b.value,
          })),
        },
        barPrimary: {
          title: 'By branch',
          hint: 'In-progress attempts per department',
          data: countByField(inProgress, 'branch', 'Unassigned'),
          layout: 'horizontal',
          primaryColor: '#0891b2',
        },
      });

    case 'completed':
      return buildView(key, ctx, {
        title: 'Completed attempts',
        subtitle: 'Submitted attempts with final scores',
        heroLabel: 'Completed',
        heroValue: String(summary.completed_count),
        heroHint: `Pass rate ${formatScorePercentLabel(summary.pass_rate)}`,
        kpis: [
          { label: 'Completed', value: completed.length, tone: 'emerald' },
          { label: 'Passed', value: completed.filter((r) => r.score >= 40).length, tone: 'navy' },
          {
            label: 'Avg score',
            value: formatScorePercentLabel(
              completed.length ? averageScorePercent(completed.map((r) => r.score)) : summary.avg_score,
            ),
            tone: 'amber',
          },
          {
            label: 'Highest',
            value: formatScorePercentLabel(
              completed.length ? Math.max(...completed.map((r) => r.score)) : summary.highest_score,
            ),
            tone: 'cyan',
          },
        ],
        pie: {
          title: 'Pass vs fail',
          hint: 'Completed attempts at or above 40%',
          data: passFailPie(completed),
          colors: ['#10b981', '#f43f5e'],
        },
        barPrimary: {
          title: 'Score distribution',
          hint: 'How completed attempts are spread',
          data: scoreBandBar(completed),
          primaryColor: '#1e3a5f',
        },
      });

    case 'unique_students':
      return buildView(key, ctx, {
        title: 'Unique students',
        subtitle: 'Learners with at least one attempt in this report',
        heroLabel: 'Students',
        heroValue: String(summary.unique_students),
        heroHint: `${summary.total_attempts} total attempts`,
        kpis: [
          { label: 'Students', value: summary.unique_students, tone: 'navy' },
          {
            label: 'Avg attempts',
            value:
              summary.unique_students > 0
                ? (summary.total_attempts / summary.unique_students).toFixed(1)
                : '0',
            tone: 'emerald',
          },
          { label: 'Branches', value: uniqueStudentsByBranch(rows).length, tone: 'amber' },
          { label: 'Tests', value: new Set(rows.map((r) => r.test_id)).size, tone: 'cyan' },
        ],
        barPrimary: {
          title: 'Students by branch',
          hint: 'Unique learners per department',
          data: uniqueStudentsByBranch(rows),
          layout: 'horizontal',
        },
        pie: {
          title: 'Engagement',
          hint: 'Single vs multiple attempts per student',
          data: (() => {
            const byUser = new Map<string, number>();
            for (const r of rows) {
              byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
            }
            const counts = Array.from(byUser.values());
            return [
              { name: 'once', label: 'One attempt', value: counts.filter((n) => n === 1).length },
              { name: 'multi', label: 'Multiple', value: counts.filter((n) => n > 1).length },
            ];
          })(),
        },
      });

    case 'avg_score': {
      const scored = completed.length > 0 ? completed : rows.filter((r) => r.score > 0);
      const avg =
        scored.length > 0
          ? averageScorePercent(scored.map((r) => r.score))
          : summary.avg_score;
      return buildView(key, ctx, {
        title: 'Average score',
        subtitle: completed.length > 0 ? 'Based on completed attempts' : 'Includes live in-progress scores',
        heroLabel: 'Mean score',
        heroValue: formatScorePercentLabel(avg),
        heroHint: `${scored.length} attempt${scored.length === 1 ? '' : 's'}`,
        kpis: [
          { label: 'Average', value: formatScorePercentLabel(avg), tone: 'navy' },
          { label: 'Attempts', value: scored.length, tone: 'emerald' },
          { label: 'Passed', value: scored.filter((r) => r.score >= 40).length, tone: 'cyan' },
          {
            label: 'Median band',
            value: scored.length ? (avg >= 75 ? 'Strong' : avg >= 40 ? 'Pass' : 'Support') : '—',
            tone: 'amber',
          },
        ],
        pie: {
          title: 'Score bands',
          hint: 'Distribution across attempts',
          data: scoreBandBar(scored).map((b) => ({
            name: b.shortLabel,
            label: b.label,
            value: b.value,
          })),
          colors: ['#10b981', '#22c55e', '#f59e0b', '#f43f5e'],
        },
        barPrimary: {
          title: 'Average by branch',
          hint: 'Mean score per department',
          data: avgByBranch(scored),
          primaryColor: '#1e3a5f',
        },
      });
    }

    case 'highest_score': {
      const ranked = [...rows].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
      const top = ranked[0]?.score ?? summary.highest_score;
      return buildView(key, ctx, {
        title: 'Top performers',
        subtitle: 'Highest scores in this report (live + completed)',
        heroLabel: 'Highest',
        heroValue: formatScorePercentLabel(top),
        heroHint: ranked[0] ? `${ranked[0].student_name}` : undefined,
        kpis: [
          { label: 'Top score', value: formatScorePercentLabel(top), tone: 'amber' },
          { label: '90%+', value: ranked.filter((r) => r.score >= 90).length, tone: 'emerald' },
          { label: '75%+', value: ranked.filter((r) => r.score >= 75).length, tone: 'navy' },
          { label: 'Ranked', value: ranked.length, tone: 'cyan' },
        ],
        barPrimary: {
          title: 'Top scores',
          hint: 'Leading attempts by percentage',
          data: topScoresBar(ranked),
          layout: 'horizontal',
          primaryColor: '#c4a052',
        },
        pie: {
          title: 'Excellence bands',
          hint: 'How many attempts reached top tiers',
          data: [
            { name: 'elite', label: '95–100%', value: ranked.filter((r) => r.score >= 95).length },
            { name: 'high', label: '90–94%', value: ranked.filter((r) => r.score >= 90 && r.score < 95).length },
            { name: 'good', label: '75–89%', value: ranked.filter((r) => r.score >= 75 && r.score < 90).length },
          ],
          colors: ['#c4a052', '#10b981', '#6366f1'],
        },
      });
    }

    default:
      return null;
  }
}
