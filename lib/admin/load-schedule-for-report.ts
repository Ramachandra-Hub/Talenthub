import type { DbServiceClient } from '@/lib/db/get-db-service';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import type { EvaloraModuleScheduleRow } from '@/lib/evalora/module-schedule';
import { isElevateXModule } from '@/lib/elevatex';
import type { AdminExamType } from '@/lib/admin/exam-type';
import { classifyExamAttempt } from '@/lib/admin/exam-type';
import { DSA_HARD_OPEN_PREFIX } from '@/lib/exams/dsa-hard-open-constants';
import { prisma } from '@/lib/prisma';
import { isUuidAttemptId } from '@/lib/db/resolve-test-id-for-insert';

export type LoadedScheduleForReport = {
  schedule: ExamScheduleRow;
  faculty_title: string | null;
  source: 'exam_schedules' | 'evalora_module_schedules' | 'published_exam';
  exam_type: AdminExamType;
};

function evaloraToExamSchedule(row: EvaloraModuleScheduleRow): ExamScheduleRow {
  const title =
    row.title?.trim() ||
    (isElevateXModule(row.module_key) ? 'ElevateX' : row.module_key.replace(/_/g, ' '));

  return {
    id: row.id,
    title,
    description: null,
    notice: row.notice,
    faculty_exam_request_id: null,
    test_id: row.module_key,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    target_departments: row.target_departments ?? [],
    target_years: row.target_years ?? [],
    slot_number: null,
    created_at: row.starts_at,
    updated_at: row.starts_at,
  } as ExamScheduleRow;
}

function examTypeForSchedule(schedule: ExamScheduleRow, source: LoadedScheduleForReport['source']): AdminExamType {
  const testId = String(schedule.test_id ?? '');
  if (source === 'evalora_module_schedules') {
    if (isElevateXModule(testId)) return 'elevatex';
    if (/\brmset\b/i.test(testId) || /\brmset\b/i.test(schedule.title)) return 'rmset';
    return 'all';
  }
  if (source === 'published_exam') {
    return classifyExamAttempt({
      test_id: testId,
      test_name: schedule.title,
      category_slug: null,
    });
  }
  return 'department';
}

export async function loadScheduleForReport(
  admin: DbServiceClient,
  scheduleId: string,
): Promise<LoadedScheduleForReport | null> {
  if (scheduleId.startsWith('exam:')) {
    const examId = scheduleId.slice('exam:'.length);
    if (!isUuidAttemptId(examId)) return null;
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam?.publishedTestId) return null;
    const testId = String(exam.publishedTestId).trim();
    const isHardOpen = testId.startsWith(DSA_HARD_OPEN_PREFIX);
    const schedule: ExamScheduleRow = {
      id: scheduleId,
      title: exam.title?.trim() || (isHardOpen ? 'Hard Coding Open Link' : 'Open exam link'),
      description: exam.description ?? null,
      notice: exam.openLinkEnabled
        ? isHardOpen
          ? 'Hard coding open link'
          : 'Open exam link'
        : null,
      faculty_exam_request_id: exam.facultyExamRequestId ?? null,
      test_id: testId,
      status: exam.status === 'published' ? 'live' : 'ended',
      starts_at: exam.startTime.toISOString(),
      ends_at: exam.endTime.toISOString(),
      target_departments: [],
      target_years: isHardOpen ? ['IV Year'] : [],
      slot_number: null,
      created_at: exam.createdAt.toISOString(),
      updated_at: exam.updatedAt.toISOString(),
    };
    return {
      schedule,
      faculty_title: null,
      source: 'published_exam',
      exam_type: examTypeForSchedule(schedule, 'published_exam'),
    };
  }

  const { data: examRow } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();

  if (examRow) {
    const schedule = examRow as ExamScheduleRow;
    let faculty_title: string | null = null;
    if (schedule.faculty_exam_request_id) {
      const { data: facultyRow } = await admin
        .from('faculty_exam_requests')
        .select('title')
        .eq('id', schedule.faculty_exam_request_id)
        .maybeSingle();
      faculty_title = (facultyRow?.title as string | null) ?? null;
    }
    return {
      schedule,
      faculty_title,
      source: 'exam_schedules',
      exam_type: examTypeForSchedule(schedule, 'exam_schedules'),
    };
  }

  const { data: evaloraRow } = await admin
    .from('evalora_module_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();

  if (!evaloraRow) return null;

  const schedule = evaloraToExamSchedule(evaloraRow as EvaloraModuleScheduleRow);
  return {
    schedule,
    faculty_title: null,
    source: 'evalora_module_schedules',
    exam_type: examTypeForSchedule(schedule, 'evalora_module_schedules'),
  };
}

export function scheduleReportContextFromLoaded(
  loaded: LoadedScheduleForReport,
): import('@/lib/admin/schedule-report-filter').ScheduleReportContext {
  return {
    starts_at: loaded.schedule.starts_at,
    ends_at: loaded.schedule.ends_at,
    test_id: loaded.schedule.test_id ? String(loaded.schedule.test_id) : null,
    title: loaded.schedule.title,
    faculty_title: loaded.faculty_title,
  };
}
