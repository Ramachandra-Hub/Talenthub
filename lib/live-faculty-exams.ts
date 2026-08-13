import { examMatchesDepartment } from '@/lib/department-match';
import { academicYearInList } from '@/lib/academic-year-match';
import { parseTargetStringArray } from '@/lib/targeting-parse';
import {
  isFacultyExamLiveForStudent,
  isScheduleLiveNow,
  type ExamScheduleRow,
  type StudentExamSchedule,
} from '@/lib/exam-schedule';
import { studentTakeUrlForTestId } from '@/lib/exam-builder/elevatex-exam';
import { scheduleSlotNumber } from '@/lib/exam-schedule-slots';
import {
  resolveStudentExamDescription,
  sanitizeStudentExamTopic,
  sanitizeStudentFacingText,
} from '@/lib/placement/elevatex-exam-config';

type ApprovedRequest = {
  id: string;
  title: string;
  topic: string | null;
  description: string | null;
  duration_minutes: number;
  target_years: string[];
  target_branches: string[];
  published_test_id: string;
  department: string;
};

/** Live faculty exams for a student, including when schedule targeting is loose. */
export function listLiveFacultyExamsForStudent(
  requests: ApprovedRequest[],
  schedules: ExamScheduleRow[],
  department: string,
  year: string,
  extras?: Map<string, { duration_minutes?: number; topic?: string | null }>,
  /** When set, only schedules for the student's assigned slot count as live. */
  studentSlotByRequestId?: Map<string, number>,
): StudentExamSchedule[] {
  const live: StudentExamSchedule[] = [];
  const seenTestIds = new Set<string>();

  for (const req of requests) {
    const years = parseTargetStringArray(req.target_years);
    const onSlotRoster = studentSlotByRequestId?.has(req.id);
    if (!academicYearInList(year, years)) continue;
    if (!onSlotRoster && !examMatchesDepartment(req, department)) continue;
    const related = schedules.filter((s) => s.faculty_exam_request_id === req.id);
    const assignedSlot = studentSlotByRequestId?.get(req.id);
    const relevant =
      assignedSlot != null
        ? related.filter((s) => scheduleSlotNumber(s) === assignedSlot)
        : related;

    if (
      !isFacultyExamLiveForStudent(
        req.id,
        relevant.length > 0 ? relevant : related,
        department,
        year,
      )
    ) {
      continue;
    }

    const testId = String(req.published_test_id);
    if (!testId || seenTestIds.has(testId)) continue;
    seenTestIds.add(testId);

    const liveSchedule = relevant.find((s) => isScheduleLiveNow(s)) ?? relevant[0] ?? related[0];

    const meta = extras?.get(req.id);
    const topic = sanitizeStudentExamTopic(meta?.topic ?? req.topic ?? null, department);
    live.push({
      id: liveSchedule?.id ?? req.id,
      title:
        sanitizeStudentFacingText(req.title, department) ||
        req.title,
      description: resolveStudentExamDescription(req.description, req.topic, department),
      notice: liveSchedule?.notice ?? null,
      faculty_exam_request_id: req.id,
      test_id: testId,
      status: 'live',
      starts_at: liveSchedule?.starts_at ?? new Date().toISOString(),
      ends_at: liveSchedule?.ends_at ?? null,
      target_departments: liveSchedule?.target_departments ?? [
        req.department,
        ...(req.target_branches ?? []),
      ],
      target_years: liveSchedule?.target_years ?? years,
      created_by: liveSchedule?.created_by ?? null,
      created_at: liveSchedule?.created_at ?? new Date().toISOString(),
      updated_at: liveSchedule?.updated_at ?? new Date().toISOString(),
      kind: 'live',
      take_url: studentTakeUrlForTestId(testId),
      duration_minutes: meta?.duration_minutes ?? req.duration_minutes ?? null,
      topic,
    });
  }

  return live;
}
