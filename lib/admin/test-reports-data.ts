import type { DbServiceClient } from '@/lib/db/get-db-service';
import {
  classifyExamAttempt,
  matchesAdminExamType,
  type AdminExamType,
} from '@/lib/admin/exam-type';
import { type RollupAttempt } from '@/lib/admin/attempts-rollup';
import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import { averageScorePercent, roundRatePercent, roundScorePercent } from '@/lib/format-score';
import {
  filterRollupAttemptsForSchedule,
  bestAttemptPerUser,
  latestAttemptPerUser,
  sortTestReportRows,
  type ScheduleReportContext,
} from '@/lib/admin/schedule-report-filter';
import {
  loadScheduleForReport,
  scheduleReportContextFromLoaded,
} from '@/lib/admin/load-schedule-for-report';
import { loadElevateXTodayReportFast } from '@/lib/admin/elevatex-today-report';
import {
  getIstDayBoundsIso,
  isInstantInDateRange,
  parseReportDateFilter,
  parseReportDateRangeFilter,
} from '@/lib/admin/report-date-filter';
import {
  loadReportScheduleOptions,
  type ReportScheduleOption,
} from '@/lib/admin/report-schedule-options';
import { testIdsMatch } from '@/lib/test-attempts';

export type { ReportScheduleOption };

export type TestReportRow = {
  attempt_id: string;
  user_id: string;
  student_name: string;
  email: string;
  roll_number: string;
  branch: string | null;
  academic_year: string | null;
  test_id: string | null;
  test_name: string;
  exam_type: Exclude<AdminExamType, 'all'>;
  score: number;
  status: string;
  completed_at: string | null;
  created_at: string;
  time_taken_sec: number | null;
  rank?: number;
  slot_number?: number | null;
  schedule_title?: string | null;
};

export type TestOption = {
  id: string;
  name: string;
  attempt_count: number;
};

export type TestReportsLoadOptions = {
  /** `today` or YYYY-MM-DD in IST — only attempts active on that calendar day. */
  dateFilter?: string | null;
  /** Inclusive IST range — overrides single `dateFilter` when both bounds are set. */
  startDate?: string | null;
  endDate?: string | null;
};

export type TestReportsPayload = {
  exam_type: AdminExamType;
  report_date?: string;
  report_date_label?: string;
  report_date_start?: string;
  report_date_end?: string;
  report_date_range_label?: string;
  schedule?: {
    id: string;
    title: string;
    slot_number: number | null;
    attempt_round?: number;
    starts_at: string;
    ends_at: string | null;
  };
  summary: {
    total_attempts: number;
    in_progress_count: number;
    completed_count: number;
    unique_students: number;
    avg_score: number;
    pass_rate: number;
    highest_score: number;
  };
  tests: TestOption[];
  rows: TestReportRow[];
  /** All exam / module schedules — use for date + slot filters in the reports UI. */
  schedule_options: ReportScheduleOption[];
};

export async function loadTestReportsPayload(
  admin: DbServiceClient,
  examType: AdminExamType,
  testIdFilter?: string,
  scheduleIdFilter?: string,
  options?: TestReportsLoadOptions,
): Promise<TestReportsPayload> {
  const dateRange =
    parseReportDateRangeFilter(options?.startDate, options?.endDate) ??
    (options?.dateFilter
      ? (() => {
          const single = parseReportDateFilter(options.dateFilter);
          return single
            ? {
                startKey: single.dateKey,
                endKey: single.dateKey,
                label: single.label,
                isSingleDay: true,
              }
            : null;
        })()
      : null);

  const reportDateKey = dateRange?.isSingleDay ? dateRange.startKey : undefined;
  const reportDateLabel = dateRange?.isSingleDay ? dateRange.label : undefined;

  const dateBounds =
    dateRange
      ? {
          fromIso: getIstDayBoundsIso(dateRange.startKey).start,
          toIso: getIstDayBoundsIso(dateRange.endKey).end,
        }
      : null;

  if (
    examType === 'elevatex' &&
    dateRange?.isSingleDay &&
    reportDateKey &&
    reportDateLabel &&
    !scheduleIdFilter &&
    (!testIdFilter || testIdFilter === 'all')
  ) {
    return loadElevateXTodayReportFast(admin, reportDateKey, reportDateLabel);
  }

  const {
    loadAdminStudentsPrisma,
    loadAllAttemptsRollupPrisma,
  } = await import('@/lib/admin/attempts-rollup-prisma');

  const [students, { attempts, testsById }, categoriesRes, testsRes, scheduleOptions] =
    await Promise.all([
      loadAdminStudentsPrisma(),
      loadAllAttemptsRollupPrisma({
        fromIso: dateBounds?.fromIso,
        toIso: dateBounds?.toIso,
        includeAnswers: false,
        includeDashboardStats: !dateBounds,
      }),
      admin.from('test_categories').select('id, name, slug'),
      admin.from('tests').select('id, title, name, category_id'),
      loadReportScheduleOptions(admin),
    ]);

  const categories = categoriesRes.error
    ? []
    : (categoriesRes.data ?? []).map((c) => ({
        id: String(c.id),
        slug: String(c.slug),
      }));

  const categorySlugByTestId = new Map<string, string>();
  for (const row of testsRes.data ?? []) {
    const id = String(row.id);
    const catId = String(row.category_id ?? '');
    const slug = categories.find((c) => c.id === catId)?.slug ?? '';
    categorySlugByTestId.set(id, slug);
    if (!testsById.has(id)) {
      testsById.set(id, String(row.title ?? row.name ?? `Test ${id}`));
    }
  }

  const studentById = new Map(students.map((s) => [s.id, s]));

  const enriched: Array<RollupAttempt & { exam_type: Exclude<AdminExamType, 'all'>; category_slug: string }> =
    attempts.map((a) => {
      const category_slug = a.test_id ? (categorySlugByTestId.get(a.test_id) ?? '') : '';
      return {
        ...a,
        category_slug,
        exam_type: classifyExamAttempt({
          test_id: a.test_id,
          test_name: a.test_name,
          category_slug,
        }),
      };
    });

  let filtered = enriched.filter((a) =>
    matchesAdminExamType(examType, {
      test_id: a.test_id,
      test_name: a.test_name,
      category_slug: a.category_slug,
    }),
  );

  const attemptKey = (a: (typeof enriched)[0]) => a.test_id ?? `title:${a.test_name}`;

  if (testIdFilter && testIdFilter !== 'all') {
    filtered = filtered.filter((a) => {
      if (attemptKey(a) === testIdFilter) return true;
      return Boolean(a.test_id && testIdsMatch(a.test_id, testIdFilter));
    });
  }

  if (dateRange) {
    filtered = filtered.filter(
      (a) =>
        isInstantInDateRange(a.completed_at, dateRange.startKey, dateRange.endKey) ||
        isInstantInDateRange(a.created_at, dateRange.startKey, dateRange.endKey),
    );
    if (!scheduleIdFilter) {
      filtered = (
        examType === 'elevatex' ? latestAttemptPerUser(filtered) : bestAttemptPerUser(filtered)
      ) as typeof filtered;
    }
  }

  let scheduleMeta: TestReportsPayload['schedule'];
  let scheduleContext: ScheduleReportContext | null = null;
  let slotNumber: number | null = null;
  let scheduleTitle: string | null = null;

  if (scheduleIdFilter) {
    const loaded = await loadScheduleForReport(admin, scheduleIdFilter);
    if (loaded) {
      scheduleContext = scheduleReportContextFromLoaded(loaded);
      slotNumber = loaded.schedule.slot_number ?? null;
      scheduleTitle = loaded.schedule.title;
      scheduleMeta = {
        id: loaded.schedule.id,
        title: loaded.schedule.title,
        slot_number: slotNumber,
        attempt_round: loaded.schedule.attempt_round ?? 1,
        starts_at: loaded.schedule.starts_at,
        ends_at: loaded.schedule.ends_at,
      };
      const scoped = filterRollupAttemptsForSchedule(filtered, scheduleContext);
      filtered = latestAttemptPerUser(scoped).map((a) => {
        const category_slug = a.test_id ? (categorySlugByTestId.get(a.test_id) ?? '') : '';
        return {
          ...a,
          category_slug,
          exam_type: classifyExamAttempt({
            test_id: a.test_id,
            test_name: a.test_name,
            category_slug,
          }),
        };
      });
    }
  }

  const testCounts = new Map<string, { name: string; count: number }>();
  for (const a of filtered) {
    const id = attemptKey(a);
    const name = a.test_name || testsById.get(a.test_id ?? '') || id;
    const prev = testCounts.get(id);
    testCounts.set(id, { name, count: (prev?.count ?? 0) + 1 });
  }

  const tests: TestOption[] = Array.from(testCounts.entries())
    .map(([id, v]) => ({ id, name: v.name, attempt_count: v.count }))
    .sort((a, b) => b.attempt_count - a.attempt_count);

  const rows: TestReportRow[] = sortTestReportRows(
    filtered.map((a) => {
      const student = studentById.get(a.user_id);
      return {
        attempt_id: a.id,
        user_id: a.user_id,
        student_name: student?.full_name?.trim() || student?.email || 'Student',
        email: student?.email ?? '',
        roll_number: student?.roll_number ?? '',
        branch: student?.branch ?? null,
        academic_year: student?.academic_year ?? null,
        test_id: a.test_id,
        test_name: a.test_name,
        exam_type: a.exam_type,
        score: roundScorePercent(a.score),
        status: a.status,
        completed_at: a.completed_at,
        created_at: a.created_at,
        time_taken_sec: a.time_taken,
        slot_number: a.slot_number ?? slotNumber,
        schedule_title: scheduleTitle,
      };
    }),
  );

  const completedRows = rows.filter((r) =>
    isCompletedAttemptStatus(r.status, r.completed_at),
  );
  const inProgressCount = rows.filter(
    (r) => isInProgressStatus(r.status) && !r.completed_at,
  ).length;
  const scores = completedRows.map((r) => r.score);
  const uniqueStudents = new Set(rows.map((r) => r.user_id)).size;
  const passed = scores.filter((s) => s >= 40).length;

  return {
    exam_type: examType,
    report_date: reportDateKey,
    report_date_label: reportDateLabel,
    report_date_start: dateRange?.startKey,
    report_date_end: dateRange?.endKey,
    report_date_range_label: dateRange && !dateRange.isSingleDay ? dateRange.label : undefined,
    schedule: scheduleMeta,
    summary: {
      total_attempts: rows.length,
      in_progress_count: inProgressCount,
      completed_count: completedRows.length,
      unique_students: uniqueStudents,
      avg_score: scores.length > 0 ? averageScorePercent(scores) : 0,
      pass_rate:
        scores.length > 0 ? roundRatePercent((passed / scores.length) * 100) : 0,
      highest_score:
        scores.length > 0 ? roundScorePercent(Math.max(...scores)) : 0,
    },
    tests,
    rows,
    schedule_options: scheduleOptions,
  };
}
