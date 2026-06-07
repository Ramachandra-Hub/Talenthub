import type { DbServiceClient } from '@/lib/db/get-db-service';
import { ELEVATEX_TEST_ID, isElevateXTestId } from '@/lib/elevatex';

export type ExamCleanupSummary = {
  keepDateIst: string;
  dryRun: boolean;
  keptFacultyRequestIds: string[];
  deletedFacultyRequestIds: string[];
  deletedScheduleIds: string[];
  deletedTestIds: string[];
  deletedAttemptIds: string[];
  deletedSlotRosterRows: number;
  deletedStudentRosterRows: number;
  deletedBuilderDrawRows: number;
  deletedQuestionRows: number;
  deletedEvaloraScheduleIds: string[];
  errors: string[];
};

/** Start of calendar day in Asia/Kolkata as UTC ISO string. */
export function startOfTodayIstIso(now = new Date()): string {
  const dateIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${dateIst}T00:00:00+05:30`).toISOString();
}

function isOnOrAfterTodayIst(iso: string | null | undefined, startIst: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const start = new Date(startIst).getTime();
  return Number.isFinite(t) && t >= start;
}

function shouldKeepFacultyRequest(
  row: { created_at?: string | null; reviewed_at?: string | null; updated_at?: string | null },
  startIst: string,
): boolean {
  return (
    isOnOrAfterTodayIst(String(row.created_at ?? ''), startIst) ||
    isOnOrAfterTodayIst(String(row.reviewed_at ?? ''), startIst) ||
    isOnOrAfterTodayIst(String(row.updated_at ?? ''), startIst)
  );
}

function protectTestId(testId: string | null | undefined): boolean {
  const id = String(testId ?? '').trim();
  if (!id) return true;
  if (isElevateXTestId(id)) return true;
  if (id === ELEVATEX_TEST_ID) return true;
  return false;
}

async function deleteByIds(
  db: DbServiceClient,
  table: string,
  column: string,
  ids: string[],
): Promise<string | null> {
  if (ids.length === 0) return null;
  const { error } = await db.from(table).delete().in(column, ids);
  return error?.message ?? null;
}

async function countDelete(
  db: DbServiceClient,
  table: string,
  column: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count, error } = await db
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, ids);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Remove faculty/admin exam data older than today (IST). Keeps ElevateX test + attempts.
 * Faculty requests are kept when created, reviewed, or updated today.
 */
export async function cleanupExamsKeepToday(
  db: DbServiceClient,
  options?: { dryRun?: boolean; now?: Date },
): Promise<ExamCleanupSummary> {
  const dryRun = options?.dryRun ?? true;
  const startIst = startOfTodayIstIso(options?.now);
  const keepDateIst = startIst.slice(0, 10);
  const summary: ExamCleanupSummary = {
    keepDateIst,
    dryRun,
    keptFacultyRequestIds: [],
    deletedFacultyRequestIds: [],
    deletedScheduleIds: [],
    deletedTestIds: [],
    deletedAttemptIds: [],
    deletedSlotRosterRows: 0,
    deletedStudentRosterRows: 0,
    deletedBuilderDrawRows: 0,
    deletedQuestionRows: 0,
    deletedEvaloraScheduleIds: [],
    errors: [],
  };

  const { data: facultyRows, error: facultyErr } = await db
    .from('faculty_exam_requests')
    .select('id, published_test_id, created_at, reviewed_at, updated_at');

  if (facultyErr) {
    summary.errors.push(`faculty_exam_requests: ${facultyErr.message}`);
    return summary;
  }

  const keepFacultyIds = new Set<string>();
  const deleteFacultyIds: string[] = [];
  const deleteTestIds = new Set<string>();

  for (const row of facultyRows ?? []) {
    const id = String(row.id);
    if (shouldKeepFacultyRequest(row, startIst)) {
      keepFacultyIds.add(id);
      summary.keptFacultyRequestIds.push(id);
    } else {
      deleteFacultyIds.push(id);
      if (row.published_test_id && !protectTestId(String(row.published_test_id))) {
        deleteTestIds.add(String(row.published_test_id));
      }
    }
  }
  summary.deletedFacultyRequestIds = deleteFacultyIds;

  const { data: scheduleRows, error: schedErr } = await db
    .from('exam_schedules')
    .select('id, faculty_exam_request_id, test_id, created_at, updated_at');

  if (schedErr) {
    summary.errors.push(`exam_schedules: ${schedErr.message}`);
  } else {
    const deleteScheduleIds: string[] = [];
    for (const row of scheduleRows ?? []) {
      const requestId = row.faculty_exam_request_id ? String(row.faculty_exam_request_id) : '';
      const keepByRequest = requestId && keepFacultyIds.has(requestId);
      const keepByDate =
        isOnOrAfterTodayIst(String(row.created_at ?? ''), startIst) ||
        isOnOrAfterTodayIst(String(row.updated_at ?? ''), startIst);
      if (keepByRequest || keepByDate) continue;
      deleteScheduleIds.push(String(row.id));
      if (row.test_id && !protectTestId(String(row.test_id))) {
        deleteTestIds.add(String(row.test_id));
      }
    }
    summary.deletedScheduleIds = deleteScheduleIds;

    if (!dryRun && deleteScheduleIds.length) {
      summary.deletedStudentRosterRows = await countDelete(
        db,
        'exam_student_roster',
        'schedule_id',
        deleteScheduleIds,
      );
      const rosterErr = await deleteByIds(
        db,
        'exam_student_roster',
        'schedule_id',
        deleteScheduleIds,
      );
      if (rosterErr) summary.errors.push(`exam_student_roster: ${rosterErr}`);

      const schedDelErr = await deleteByIds(db, 'exam_schedules', 'id', deleteScheduleIds);
      if (schedDelErr) summary.errors.push(`exam_schedules delete: ${schedDelErr}`);
    } else if (dryRun && deleteScheduleIds.length) {
      summary.deletedStudentRosterRows = await countDelete(
        db,
        'exam_student_roster',
        'schedule_id',
        deleteScheduleIds,
      );
    }
  }

  if (deleteFacultyIds.length) {
    if (dryRun) {
      summary.deletedSlotRosterRows = await countDelete(
        db,
        'exam_slot_roster_entries',
        'faculty_exam_request_id',
        deleteFacultyIds,
      );
      summary.deletedBuilderDrawRows = await countDelete(
        db,
        'exam_builder_draws',
        'faculty_exam_request_id',
        deleteFacultyIds,
      );
    } else {
      summary.deletedSlotRosterRows = await countDelete(
        db,
        'exam_slot_roster_entries',
        'faculty_exam_request_id',
        deleteFacultyIds,
      );
      const slotErr = await deleteByIds(
        db,
        'exam_slot_roster_entries',
        'faculty_exam_request_id',
        deleteFacultyIds,
      );
      if (slotErr) summary.errors.push(`exam_slot_roster_entries: ${slotErr}`);

      summary.deletedBuilderDrawRows = await countDelete(
        db,
        'exam_builder_draws',
        'faculty_exam_request_id',
        deleteFacultyIds,
      );
      const drawErr = await deleteByIds(
        db,
        'exam_builder_draws',
        'faculty_exam_request_id',
        deleteFacultyIds,
      );
      if (drawErr) summary.errors.push(`exam_builder_draws: ${drawErr}`);

      const facultyDelErr = await deleteByIds(
        db,
        'faculty_exam_requests',
        'id',
        deleteFacultyIds,
      );
      if (facultyDelErr) summary.errors.push(`faculty_exam_requests delete: ${facultyDelErr}`);
    }
  }

  const testIdsToDelete = [...deleteTestIds].filter((id) => !protectTestId(id));
  summary.deletedTestIds = testIdsToDelete;

  if (testIdsToDelete.length) {
    const { data: attemptRows } = await db
      .from('test_attempts')
      .select('id, test_id')
      .in('test_id', testIdsToDelete);

    const attemptIds = (attemptRows ?? []).map((r) => String(r.id));
    summary.deletedAttemptIds = attemptIds;

    if (!dryRun) {
      if (attemptIds.length) {
        await deleteByIds(db, 'exam_violations', 'attempt_id', attemptIds);
      }
      const attemptErr = await deleteByIds(db, 'test_attempts', 'test_id', testIdsToDelete);
      if (attemptErr) summary.errors.push(`test_attempts: ${attemptErr}`);

      await deleteByIds(db, 'exam_builder_draws', 'test_id', testIdsToDelete);
      await deleteByIds(db, 'test_questions', 'test_id', testIdsToDelete);

      summary.deletedQuestionRows = await countDelete(
        db,
        'questions',
        'test_id',
        testIdsToDelete,
      );
      const qErr = await deleteByIds(db, 'questions', 'test_id', testIdsToDelete);
      if (qErr) summary.errors.push(`questions: ${qErr}`);

      const testErr = await deleteByIds(db, 'tests', 'id', testIdsToDelete);
      if (testErr) summary.errors.push(`tests: ${testErr}`);
    } else {
      summary.deletedQuestionRows = await countDelete(
        db,
        'questions',
        'test_id',
        testIdsToDelete,
      );
    }
  }

  const { data: evaloraRows, error: evaloraErr } = await db
    .from('evalora_module_schedules')
    .select('id, created_at, updated_at');

  if (evaloraErr) {
    const msg = String(evaloraErr.message ?? '').toLowerCase();
    if (!msg.includes('evalora_module_schedules')) {
      summary.errors.push(`evalora_module_schedules: ${evaloraErr.message}`);
    }
  } else {
    const deleteEvaloraIds = (evaloraRows ?? [])
      .filter(
        (row) =>
          !isOnOrAfterTodayIst(String(row.created_at ?? ''), startIst) &&
          !isOnOrAfterTodayIst(String(row.updated_at ?? ''), startIst),
      )
      .map((row) => String(row.id));
    summary.deletedEvaloraScheduleIds = deleteEvaloraIds;

    if (!dryRun && deleteEvaloraIds.length) {
      const err = await deleteByIds(db, 'evalora_module_schedules', 'id', deleteEvaloraIds);
      if (err) summary.errors.push(`evalora_module_schedules delete: ${err}`);
    }
  }

  return summary;
}
