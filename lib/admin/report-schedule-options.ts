import type { DbServiceClient } from '@/lib/db/get-db-service';
import type { AdminExamType } from '@/lib/admin/exam-type';
import { classifyExamAttempt, matchesAdminExamType } from '@/lib/admin/exam-type';
import { getDateKeyInTimeZone } from '@/lib/admin/report-date-filter';
import { formatCollegeDateTime } from '@/lib/college-timezone';
import { isElevateXModule } from '@/lib/elevatex';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import type { EvaloraModuleScheduleRow } from '@/lib/evalora/module-schedule';
import { testIdsMatch } from '@/lib/test-attempts';

export type ReportScheduleOption = {
  id: string;
  test_id: string | null;
  title: string;
  slot_number: number | null;
  starts_at: string;
  ends_at: string | null;
  exam_type: Exclude<AdminExamType, 'all'>;
};

export function scheduleStartsOnDateKey(
  startsAt: string | null | undefined,
  dateKey: string,
): boolean {
  if (!startsAt || !dateKey) return false;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  return getDateKeyInTimeZone(d) === dateKey;
}

export function formatScheduleSlotLabel(
  opt: Pick<ReportScheduleOption, 'slot_number' | 'title' | 'starts_at' | 'ends_at'>,
): string {
  const label = opt.slot_number ? `Slot ${opt.slot_number}` : opt.title.trim() || 'Exam session';
  const start = formatCollegeDateTime(opt.starts_at);
  if (!opt.ends_at) return `${label} · ${start}`;
  return `${label} · ${start} → ${formatCollegeDateTime(opt.ends_at)}`;
}

function examTypeForScheduleTest(testId: string | null, title: string): Exclude<AdminExamType, 'all'> {
  if (isElevateXModule(String(testId ?? ''))) return 'elevatex';
  return classifyExamAttempt({ test_id: testId, test_name: title, category_slug: null });
}

export function filterReportScheduleOptions(
  options: ReportScheduleOption[],
  filters: {
    examType?: AdminExamType;
    testId?: string;
    dateKey?: string;
  },
): ReportScheduleOption[] {
  const { examType = 'all', testId, dateKey } = filters;
  return options.filter((opt) => {
    if (examType !== 'all' && !matchesAdminExamType(examType, { test_id: opt.test_id, test_name: opt.title })) {
      return false;
    }
    if (testId && testId !== 'all' && opt.test_id && !testIdsMatch(opt.test_id, testId)) {
      return false;
    }
    if (dateKey && !scheduleStartsOnDateKey(opt.starts_at, dateKey)) {
      return false;
    }
    return true;
  });
}

export async function loadReportScheduleOptions(
  admin: DbServiceClient,
): Promise<ReportScheduleOption[]> {
  const [examRes, evaloraRes] = await Promise.all([
    admin
      .from('exam_schedules')
      .select('id, title, test_id, slot_number, starts_at, ends_at, faculty_exam_request_id')
      .order('starts_at', { ascending: false }),
    admin
      .from('evalora_module_schedules')
      .select('id, title, module_key, starts_at, ends_at')
      .order('starts_at', { ascending: false }),
  ]);

  const options: ReportScheduleOption[] = [];

  for (const row of (examRes.data ?? []) as ExamScheduleRow[]) {
    const testId = row.test_id ? String(row.test_id) : null;
    const title = String(row.title ?? 'Exam');
    const exam_type: Exclude<AdminExamType, 'all'> = row.faculty_exam_request_id
      ? 'department'
      : examTypeForScheduleTest(testId, title);
    options.push({
      id: row.id,
      test_id: testId,
      title,
      slot_number: row.slot_number ?? null,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      exam_type,
    });
  }

  for (const row of (evaloraRes.data ?? []) as EvaloraModuleScheduleRow[]) {
    const testId = String(row.module_key ?? '');
    const title =
      row.title?.trim() ||
      (isElevateXModule(testId) ? 'ElevateX' : testId.replace(/_/g, ' '));
    options.push({
      id: row.id,
      test_id: testId,
      title,
      slot_number: null,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      exam_type: examTypeForScheduleTest(testId, title),
    });
  }

  return options.sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );
}
