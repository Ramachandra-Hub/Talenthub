import { prisma } from '@/lib/prisma';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { isScheduleLiveNow, resolveExamScheduleStatus } from '@/lib/exam-schedule';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { isElevateXAttemptTitle, isElevateXModule, isElevateXTestId } from '@/lib/elevatex';
import {
  loadAdminStudentsPrisma,
  loadAllAttemptsRollupPrisma,
} from '@/lib/admin/attempts-rollup-prisma';
import type { RollupAttempt } from '@/lib/admin/attempts-rollup';
import type { LiveBoardEntry, LiveExamBoard, LiveWritingEntry } from '@/lib/admin/live-dashboard-data';
import { testIdsMatch } from '@/lib/test-attempts';

function mapSchedule(row: {
  id: string;
  testId: string | null;
  title: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  targetDepartments: unknown;
  targetYears: unknown;
  slotNumber: number | null;
}): ExamScheduleRow {
  const nowIso = new Date().toISOString();
  return {
    id: row.id,
    title: row.title ?? 'Exam',
    description: null,
    notice: null,
    faculty_exam_request_id: null,
    test_id: row.testId ?? '',
    status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
    starts_at: row.startsAt?.toISOString() ?? nowIso,
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: (row.targetDepartments as string[]) ?? [],
    target_years: (row.targetYears as string[]) ?? [],
    slot_number: row.slotNumber,
    slot_capacity: null,
    created_by: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function isLiveForDashboard(schedule: ExamScheduleRow, now = Date.now()): boolean {
  const status = resolveExamScheduleStatus(schedule, now);
  return status.display === 'live' || isScheduleLiveNow(schedule, now);
}

export async function listLiveExamSchedulesPrisma(): Promise<ExamScheduleRow[]> {
  const now = Date.now();
  const [rows, moduleRows] = await Promise.all([
    prisma.examSchedule.findMany({
      where: { status: { not: 'ended' } },
      orderBy: { startsAt: 'desc' },
      take: 100,
    }),
    prisma.evaloraModuleSchedule.findMany({
      where: { status: { not: 'ended' } },
      orderBy: { startsAt: 'desc' },
      take: 100,
    }),
  ]);

  const live: ExamScheduleRow[] = [];
  for (const row of rows) {
    const mapped = mapSchedule(row);
    if (isLiveForDashboard(mapped, now)) live.push(mapped);
  }
  for (const row of moduleRows) {
    const mapped: ExamScheduleRow = {
      id: row.id,
      title:
        row.title?.trim() ||
        (isElevateXModule(row.moduleKey) ? 'ElevateX' : row.moduleKey.replace(/_/g, ' ')),
      description: null,
      notice: row.notice ?? null,
      faculty_exam_request_id: null,
      test_id: row.moduleKey,
      status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
      starts_at: row.startsAt.toISOString(),
      ends_at: row.endsAt?.toISOString() ?? null,
      target_departments: Array.isArray(row.targetDepartments)
        ? (row.targetDepartments as string[])
        : [],
      target_years: Array.isArray(row.targetYears) ? (row.targetYears as string[]) : [],
      slot_number: null,
      slot_capacity: null,
      created_by: row.createdBy ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
    if (isLiveForDashboard(mapped, now)) live.push(mapped);
  }

  return live.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

function attemptMatchesSchedule(attempt: RollupAttempt, schedule: ExamScheduleRow): boolean {
  const testId = String(schedule.test_id ?? '').trim();
  if (testId && attempt.test_id && testIdsMatch(attempt.test_id, testId)) return true;
  if (isElevateXModule(testId) || isElevateXTestId(testId)) {
    if (attempt.test_id && isElevateXTestId(attempt.test_id)) return true;
    if (isElevateXAttemptTitle(attempt.test_name)) return true;
  }
  const title = schedule.title?.toLowerCase() ?? '';
  return title.length > 2 && attempt.test_name.toLowerCase().includes(title);
}

function toBoardEntry(
  attempt: RollupAttempt,
  student: { roll_number: string; full_name: string | null; email: string },
  rank: number,
): LiveBoardEntry {
  const submitted = isCompletedAttemptStatus(attempt.status);
  return {
    attempt_id: attempt.id,
    user_id: attempt.user_id,
    roll_number: student.roll_number,
    student_name: student.full_name?.trim() || student.email || 'Student',
    score: attempt.score,
    status: attempt.status,
    submitted_at: submitted ? attempt.completed_at ?? attempt.created_at : null,
    updated_at: attempt.created_at,
    rank,
  };
}

export async function buildLiveExamBoardPrisma(
  schedule: ExamScheduleRow,
  preloaded?: { attempts: RollupAttempt[]; students: Awaited<ReturnType<typeof loadAdminStudentsPrisma>> },
): Promise<LiveExamBoard> {
  const students = preloaded?.students ?? (await loadAdminStudentsPrisma());
  const studentById = new Map(students.map((s) => [s.id, s]));
  const { attempts: allAttempts } = preloaded?.attempts
    ? { attempts: preloaded.attempts }
    : await loadAllAttemptsRollupPrisma();

  const matched = allAttempts.filter((a) => attemptMatchesSchedule(a, schedule));
  const latestByUser = new Map<string, RollupAttempt>();
  for (const a of matched) {
    const prev = latestByUser.get(a.user_id);
    if (!prev || new Date(a.created_at) > new Date(prev.created_at)) {
      latestByUser.set(a.user_id, a);
    }
  }

  const sorted = Array.from(latestByUser.values()).sort((a, b) => b.score - a.score);
  const entries: LiveBoardEntry[] = sorted.map((a, i) => {
    const student = studentById.get(a.user_id) ?? {
      roll_number: rollNumberFromUser(''),
      full_name: null,
      email: 'Student',
    };
    return toBoardEntry(a, student, i + 1);
  });

  const submitted = entries.filter((e) => e.submitted_at);
  const top = submitted[0] ?? null;

  return {
    schedule,
    test_title: schedule.title,
    entries,
    submitted_count: submitted.length,
    in_progress_count: entries.length - submitted.length,
    highest_score: top?.score ?? 0,
    top_scorer: top
      ? { student_name: top.student_name, roll_number: top.roll_number, score: top.score }
      : null,
  };
}

export async function buildAllLiveExamBoardsPrisma(
  schedules: ExamScheduleRow[],
): Promise<LiveExamBoard[]> {
  if (!schedules.length) return [];
  const [students, rollup] = await Promise.all([
    loadAdminStudentsPrisma(),
    loadAllAttemptsRollupPrisma(),
  ]);
  return Promise.all(
    schedules.map((s) =>
      buildLiveExamBoardPrisma(s, { attempts: rollup.attempts, students }),
    ),
  );
}

export async function buildAllLiveWritingActivityPrisma(
  schedules: ExamScheduleRow[],
): Promise<LiveWritingEntry[]> {
  const boards = await buildAllLiveExamBoardsPrisma(schedules);
  const rows: LiveWritingEntry[] = [];
  const seen = new Set<string>();

  for (const board of boards) {
    for (const entry of board.entries) {
      if (entry.submitted_at) continue;
      if (seen.has(entry.user_id)) continue;
      seen.add(entry.user_id);
      rows.push({
        ...entry,
        schedule_id: board.schedule.id,
        schedule_title: board.schedule.title,
        test_title: board.test_title,
      });
    }
  }

  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const activeSessions = await prisma.studentActiveSession.findMany({
    where: { lastHeartbeat: { gte: cutoff } },
    take: 200,
  });

  const students = await loadAdminStudentsPrisma();
  const studentById = new Map(students.map((s) => [s.id, s]));
  const schedule = schedules[0];

  for (const session of activeSessions) {
    if (seen.has(session.userId) || !schedule) continue;
    const student = studentById.get(session.userId);
    if (!student) continue;
    seen.add(session.userId);
    rows.push({
      attempt_id: `session-${session.userId}`,
      user_id: session.userId,
      roll_number: student.roll_number,
      student_name: student.full_name?.trim() || student.email,
      score: 0,
      status: 'in_progress',
      submitted_at: null,
      updated_at: session.lastHeartbeat.toISOString(),
      rank: 0,
      schedule_id: schedule.id,
      schedule_title: schedule.title,
      test_title: schedule.title,
    });
  }

  return rows;
}
