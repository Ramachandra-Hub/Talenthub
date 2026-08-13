import type { DbServiceClient } from '@/lib/db/get-db-service';
import { academicYearInList } from '@/lib/academic-year-match';
import { studentTakeUrlForTestId } from '@/lib/exam-builder/elevatex-exam';
import { isElevateXTestId } from '@/lib/elevatex';
import type { StudentEvaloraModule } from '@/lib/evalora/module-schedule';
import {
  isScheduleWindowOpen,
  scheduleEndMs,
  scheduleStartMs,
  type ExamScheduleRow,
  type StudentExamSchedule,
} from '@/lib/exam-schedule';
import {
  findStudentSlotAssignment,
  normalizeRoll,
  parseScheduleSlotsJson,
  scheduleSlotNumber,
} from '@/lib/exam-schedule-slots';
import { parseTargetStringArray } from '@/lib/targeting-parse';
import {
  resolveStudentExamDescription,
  sanitizeStudentExamTopic,
  sanitizeStudentFacingText,
} from '@/lib/placement/elevatex-exam-config';

export type ApprovedExamRequest = {
  id: string;
  title: string;
  topic: string | null;
  description: string | null;
  duration_minutes: number;
  target_years: unknown;
  target_branches: unknown;
  published_test_id: string;
  department: string;
  schedule_slots_json?: unknown;
  uses_slot_scheduling?: boolean;
};

/** Load every slot assignment for this roll (DB roster + JSON fallback). */
export async function loadStudentSlotAssignmentsByRoll(
  admin: DbServiceClient,
  rollNumber: string,
): Promise<
  Map<string, { slot_number: number; student_name: string | null; branch?: string; year?: string }>
> {
  const roll = normalizeRoll(rollNumber);
  const out = new Map<
    string,
    { slot_number: number; student_name: string | null; branch?: string; year?: string }
  >();
  if (!roll) return out;

  const { data: entries } = await admin
    .from('exam_slot_roster_entries')
    .select(
      'faculty_exam_request_id, slot_number, student_name, roll_number, department, year, branch, academic_year',
    );

  for (const row of entries ?? []) {
    if (normalizeRoll(String(row.roll_number ?? '')) !== roll) continue;
    const requestId = String(row.faculty_exam_request_id ?? '');
    const slotNum = Number(row.slot_number);
    if (!requestId || !Number.isFinite(slotNum)) continue;
    out.set(requestId, {
      slot_number: Math.floor(slotNum),
      student_name: (row.student_name as string | null) ?? null,
      branch:
        (row.department as string | null) ??
        (row.branch as string | null) ??
        undefined,
      year:
        (row.year as string | null) ?? (row.academic_year as string | null) ?? undefined,
    });
  }

  const { data: requests } = await admin
    .from('faculty_exam_requests')
    .select('id, schedule_slots_json, uses_slot_scheduling')
    .eq('status', 'approved');

  for (const req of requests ?? []) {
    const requestId = String(req.id);
    if (out.has(requestId)) continue;
    const slots = parseScheduleSlotsJson(req.schedule_slots_json);
    for (const slot of slots) {
      const hit = slot.roster.find((r) => normalizeRoll(r.roll_number) === roll);
      if (!hit) continue;
      out.set(requestId, {
        slot_number: slot.slot_number,
        student_name: hit.student_name ?? null,
        branch: hit.branch,
        year: hit.academic_year,
      });
      break;
    }
  }

  return out;
}

export type PortalScheduleVisibility = 'live' | 'upcoming' | 'hidden';

/** Admin marked live → show on portal; Start stays gated by isScheduleWindowOpen. */
export function portalVisibilityForSchedule(
  schedule: Pick<ExamScheduleRow, 'status' | 'starts_at' | 'ends_at'>,
  now = Date.now(),
): PortalScheduleVisibility {
  if (schedule.status === 'ended') return 'hidden';
  const end = scheduleEndMs(schedule.ends_at);
  if (end !== null && now > end) return 'hidden';

  if (schedule.status === 'live') return 'live';

  if (schedule.status === 'scheduled' && scheduleStartMs(schedule.starts_at) > now) {
    return 'upcoming';
  }

  return 'hidden';
}

export function yearAllowedForRosterStudent(
  request: ApprovedExamRequest,
  studentYear: string | null | undefined,
  rosterYear?: string,
): boolean {
  const years = parseTargetStringArray(request.target_years);
  const effectiveYear = (rosterYear ?? studentYear ?? '').trim();
  if (!years.length) return true;
  if (!effectiveYear) return true;
  return academicYearInList(effectiveYear, years);
}

/** One published faculty exam per student — prefer their slot and live over upcoming. */
export function dedupeFacultyExamSchedules(
  exams: StudentExamSchedule[],
  studentSlotByRequestId?: Map<string, number>,
): StudentExamSchedule[] {
  const byKey = new Map<string, StudentExamSchedule>();

  const rank = (exam: StudentExamSchedule): number => {
    if (exam.kind === 'live' && isScheduleWindowOpen(exam)) return 4;
    if (exam.kind === 'live') return 3;
    if (exam.kind === 'upcoming') return 2;
    return 1;
  };

  for (const exam of exams) {
    const reqId = exam.faculty_exam_request_id;
    const key = reqId ? `req:${reqId}` : `test:${exam.test_id}`;

    if (reqId && studentSlotByRequestId?.has(reqId)) {
      const assignedSlot = studentSlotByRequestId.get(reqId)!;
      const slot = scheduleSlotNumber(exam);
      const titleMatchesSlot = exam.title.toLowerCase().includes(`slot ${assignedSlot}`);
      if (slot !== assignedSlot && !titleMatchesSlot) continue;
    }

    const prev = byKey.get(key);
    if (!prev || rank(exam) > rank(prev)) {
      byKey.set(key, exam);
    }
  }

  return Array.from(byKey.values());
}

/** Hide legacy Evalora module rows when the same exam is already shown via faculty schedule. */
export function filterEvaloraCoveredByFaculty(
  evalora: StudentEvaloraModule[],
  faculty: StudentExamSchedule[],
): StudentEvaloraModule[] {
  const facultyTestIds = new Set(faculty.map((f) => String(f.test_id ?? '')));
  return evalora.filter((mod) => {
    if (mod.module_key === 'placement_full') {
      return ![...facultyTestIds].some((id) => isElevateXTestId(id));
    }
    return true;
  });
}

export function buildStudentExamScheduleCard(
  schedule: ExamScheduleRow,
  request: ApprovedExamRequest,
  visibility: PortalScheduleVisibility,
  extras?: { duration_minutes?: number; topic?: string | null },
  department?: string | null,
): StudentExamSchedule {
  const testId = String(request.published_test_id);
  const topic = sanitizeStudentExamTopic(extras?.topic ?? request.topic ?? null, department);
  const description = resolveStudentExamDescription(
    schedule.description ?? request.description,
    extras?.topic ?? request.topic ?? null,
    department,
  );
  const title =
    sanitizeStudentFacingText(request.title?.trim() || schedule.title, department) ||
    schedule.title;

  return {
    ...schedule,
    title,
    description,
    kind: visibility === 'live' ? 'live' : 'upcoming',
    take_url: studentTakeUrlForTestId(testId),
    duration_minutes: extras?.duration_minutes ?? request.duration_minutes ?? null,
    topic,
  };
}

export async function buildRosterFirstStudentExams(input: {
  admin: DbServiceClient;
  rollNumber: string;
  schedules: ExamScheduleRow[];
  approvedRequests: ApprovedExamRequest[];
  department: string | null;
  year: string | null;
  extras: Map<string, { duration_minutes?: number; topic?: string | null }>;
  now?: number;
}): Promise<{
  facultyLive: StudentExamSchedule[];
  facultyUpcoming: StudentExamSchedule[];
  evaloraLive: StudentEvaloraModule[];
  evaloraUpcoming: StudentEvaloraModule[];
}> {
  const now = input.now ?? Date.now();
  const assignments = await loadStudentSlotAssignmentsByRoll(input.admin, input.rollNumber);

  const facultyLive: StudentExamSchedule[] = [];
  const facultyUpcoming: StudentExamSchedule[] = [];
  const seenTestLive = new Set<string>();

  for (const [requestId, assignment] of assignments) {
    const request = input.approvedRequests.find((r) => String(r.id) === requestId);
    if (!request?.published_test_id) continue;

    if (
      !yearAllowedForRosterStudent(request, input.year, assignment.year)
    ) {
      continue;
    }

    const related = input.schedules.filter((s) => s.faculty_exam_request_id === requestId);
    let mySchedule =
      related.find((s) => scheduleSlotNumber(s) === assignment.slot_number) ?? null;

    if (!mySchedule) {
      mySchedule =
        related.find((s) =>
          s.title.toLowerCase().includes(`slot ${assignment.slot_number}`),
        ) ?? null;
    }

    if (!mySchedule) continue;

    const visibility = portalVisibilityForSchedule(mySchedule, now);
    if (visibility === 'hidden') continue;

    const meta = input.extras.get(requestId);
    const card = buildStudentExamScheduleCard(
      mySchedule,
      request,
      visibility,
      meta,
      input.department,
    );

    const testKey = String(request.published_test_id);
    if (visibility === 'live') {
      if (!seenTestLive.has(testKey)) {
        facultyLive.push(card);
        seenTestLive.add(testKey);
      }
    } else {
      facultyUpcoming.push(card);
    }
  }

  const slotMap = new Map(
    [...assignments.entries()].map(([reqId, a]) => [reqId, a.slot_number] as const),
  );

  return {
    facultyLive: dedupeFacultyExamSchedules(facultyLive, slotMap),
    facultyUpcoming: dedupeFacultyExamSchedules(facultyUpcoming, slotMap),
    evaloraLive: [],
    evaloraUpcoming: [],
  };
}

/** Resolve profile year/branch from roster when login profile is incomplete. */
export function inferProfileFromRosterAssignments(
  assignments: Map<string, { branch?: string; year?: string }>,
  department: string | null,
  year: string | null,
): { department: string; year: string } {
  let dept = department?.trim() || '';
  let yr = year?.trim() || '';

  for (const a of assignments.values()) {
    if (!dept && a.branch?.trim()) dept = a.branch.trim();
    if (!yr && a.year?.trim()) yr = a.year.trim();
  }

  if (!dept) dept = 'All departments';
  if (!yr) yr = 'III Year';

  return { department: dept, year: yr };
}

export async function findStudentSlotAssignmentForRequest(
  admin: DbServiceClient,
  requestId: string,
  rollNumber: string,
): Promise<{ slot_number: number; student_name: string | null } | null> {
  const map = await loadStudentSlotAssignmentsByRoll(admin, rollNumber);
  const hit = map.get(requestId);
  if (!hit) return null;
  return { slot_number: hit.slot_number, student_name: hit.student_name };
}

export { isScheduleWindowOpen, findStudentSlotAssignment };

export function sanitizeStudentExamScheduleForResponse(
  exam: StudentExamSchedule,
  department?: string | null,
): StudentExamSchedule {
  const rawTopic = exam.topic ?? null;
  return {
    ...exam,
    title: sanitizeStudentFacingText(exam.title, department) ?? exam.title,
    description: resolveStudentExamDescription(exam.description, rawTopic, department),
    topic: sanitizeStudentExamTopic(rawTopic, department),
  };
}
