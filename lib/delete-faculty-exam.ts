import type { DbServiceClient } from '@/lib/db/get-db-service';
import { isElevateXBuilderTestType } from '@/lib/exam-builder/elevatex-exam';
import { ELEVATEX_MODULE_KEY, isElevateXTestId } from '@/lib/elevatex';
import { prisma } from '@/lib/prisma';

export type DeleteFacultyExamResult = {
  requestId: string;
  title: string | null;
  deletedScheduleIds: string[];
  deletedTestId: string | null;
  deletedAttemptIds: string[];
  errors: string[];
};

function protectTestId(testId: string | null | undefined): boolean {
  const id = String(testId ?? '').trim();
  if (!id) return true;
  return isElevateXTestId(id);
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

/** Remove one faculty exam request and related schedules, test, attempts, questions. */
export async function deleteFacultyExamRequest(
  db: DbServiceClient,
  requestId: string,
): Promise<DeleteFacultyExamResult | { error: string }> {
  const { data: request, error: fetchErr } = await db
    .from('faculty_exam_requests')
    .select('id, title, published_test_id, test_type')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!request) return { error: 'Exam not found' };

  const result: DeleteFacultyExamResult = {
    requestId,
    title: (request.title as string | null) ?? null,
    deletedScheduleIds: [],
    deletedTestId: null,
    deletedAttemptIds: [],
    errors: [],
  };

  const { data: schedules } = await db
    .from('exam_schedules')
    .select('id')
    .eq('faculty_exam_request_id', requestId);

  const scheduleIds = (schedules ?? []).map((s) => String(s.id));
  result.deletedScheduleIds = scheduleIds;

  if (scheduleIds.length) {
    const rosterErr = await deleteByIds(db, 'exam_student_roster', 'schedule_id', scheduleIds);
    if (rosterErr) result.errors.push(`exam_student_roster: ${rosterErr}`);

    const schedErr = await deleteByIds(db, 'exam_schedules', 'id', scheduleIds);
    if (schedErr) result.errors.push(`exam_schedules: ${schedErr}`);
  }

  const slotErr = await deleteByIds(
    db,
    'exam_slot_roster_entries',
    'faculty_exam_request_id',
    [requestId],
  );
  if (slotErr) result.errors.push(`exam_slot_roster_entries: ${slotErr}`);

  const drawErr = await deleteByIds(
    db,
    'exam_builder_draws',
    'faculty_exam_request_id',
    [requestId],
  );
  if (drawErr) result.errors.push(`exam_builder_draws: ${drawErr}`);

  const publishedTestId = request.published_test_id
    ? String(request.published_test_id)
    : null;

  const isElevateX =
    isElevateXBuilderTestType(String(request.test_type ?? '')) ||
    isElevateXTestId(publishedTestId);

  if (isElevateX) {
    const evaloraErr = await deleteByIds(db, 'evalora_module_schedules', 'module_key', [
      ELEVATEX_MODULE_KEY,
    ]);
    if (evaloraErr) result.errors.push(`evalora_module_schedules: ${evaloraErr}`);
  }

  if (publishedTestId && isElevateX) {
    const { data: attempts } = await db
      .from('test_attempts')
      .select('id')
      .eq('test_id', publishedTestId);

    const attemptIds = (attempts ?? []).map((a) => String(a.id));
    result.deletedAttemptIds = attemptIds;

    if (attemptIds.length) {
      await deleteByIds(db, 'exam_violations', 'attempt_id', attemptIds);
      const attemptErr = await deleteByIds(db, 'test_attempts', 'id', attemptIds);
      if (attemptErr) result.errors.push(`test_attempts: ${attemptErr}`);
    }
  } else if (publishedTestId && !protectTestId(publishedTestId)) {
    result.deletedTestId = publishedTestId;

    const { data: attempts } = await db
      .from('test_attempts')
      .select('id')
      .eq('test_id', publishedTestId);

    const attemptIds = (attempts ?? []).map((a) => String(a.id));
    result.deletedAttemptIds = attemptIds;

    if (attemptIds.length) {
      await deleteByIds(db, 'exam_violations', 'attempt_id', attemptIds);
      const attemptErr = await deleteByIds(db, 'test_attempts', 'id', attemptIds);
      if (attemptErr) result.errors.push(`test_attempts: ${attemptErr}`);
    }

    await deleteByIds(db, 'exam_builder_draws', 'test_id', [publishedTestId]);
    await deleteByIds(db, 'test_questions', 'test_id', [publishedTestId]);
    const qErr = await deleteByIds(db, 'questions', 'test_id', [publishedTestId]);
    if (qErr) result.errors.push(`questions: ${qErr}`);
    const testErr = await deleteByIds(db, 'tests', 'id', [publishedTestId]);
    if (testErr) result.errors.push(`tests: ${testErr}`);
  }

  const reqErr = await deleteByIds(db, 'faculty_exam_requests', 'id', [requestId]);
  if (reqErr) result.errors.push(`faculty_exam_requests: ${reqErr}`);

  if (reqErr) return { error: reqErr };

  return result;
}

async function deleteRosterForSchedule(
  db: DbServiceClient,
  scheduleId: string,
): Promise<string | null> {
  let err = await deleteByIds(db, 'exam_student_roster', 'schedule_id', [scheduleId]);
  if (!err) return null;

  const legacy = await deleteByIds(db, 'exam_student_roster', 'exam_schedule_id', [scheduleId]);
  if (!legacy) return null;

  if (
    err.includes('exam_student_roster') &&
    (err.includes('does not exist') || err.includes('schema cache'))
  ) {
    return null;
  }
  return err;
}

/** Delete a single exam schedule window (roster + row). Keeps faculty request and published test. */
export async function deleteExamScheduleById(
  db: DbServiceClient,
  scheduleId: string,
): Promise<{ ok: true } | { error: string }> {
  const { data, error: fetchErr } = await db
    .from('exam_schedules')
    .select('id')
    .eq('id', scheduleId)
    .maybeSingle();

  if (fetchErr && !fetchErr.message.includes('does not exist')) {
    return { error: fetchErr.message };
  }

  const existsInPrisma = await prisma.examSchedule
    .findUnique({ where: { id: scheduleId }, select: { id: true } })
    .catch(() => null);

  if (!data && !existsInPrisma) return { error: 'Schedule not found' };

  const rosterErr = await deleteRosterForSchedule(db, scheduleId);

  const { error: slotRosterErr } = await db
    .from('exam_slot_roster_entries')
    .delete()
    .eq('schedule_id', scheduleId);
  if (slotRosterErr && !slotRosterErr.message.includes('does not exist')) {
    console.warn('[deleteExamScheduleById] exam_slot_roster_entries:', slotRosterErr.message);
  }

  const { error } = await db.from('exam_schedules').delete().eq('id', scheduleId);

  if (!error) {
    if (rosterErr) console.warn('[deleteExamScheduleById] roster cleanup:', rosterErr);
    return { ok: true };
  }

  try {
    await prisma.examStudentRoster.deleteMany({ where: { scheduleId } });
    await prisma.examSlotRosterEntry.deleteMany({ where: { scheduleId } }).catch(() => undefined);
    await prisma.examSchedule.delete({ where: { id: scheduleId } });
    return { ok: true };
  } catch (prismaErr) {
    const msg = error?.message ?? (prismaErr instanceof Error ? prismaErr.message : 'Delete failed');
    return { error: rosterErr ? `${msg}; roster: ${rosterErr}` : msg };
  }
}
