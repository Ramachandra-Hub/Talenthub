import { prisma } from '@/lib/prisma';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { isScheduleLiveNow, resolveExamScheduleStatus } from '@/lib/exam-schedule';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import {
  ELEVATEX_EXAM_NAME,
  ELEVATEX_MODULE_KEY,
  isElevateXAttemptTitle,
  isElevateXModule,
  isElevateXTestId,
} from '@/lib/elevatex';
import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import { scheduleEndMs, scheduleStartMs } from '@/lib/exam-schedule';
import {
  loadAdminStudentsPrisma,
  loadAllAttemptsRollupPrisma,
} from '@/lib/admin/attempts-rollup-prisma';
import type { RollupAttempt } from '@/lib/admin/attempts-rollup';
import type { ElevateXInProgressRow } from '@/lib/admin/elevatex-results-prisma';
import type { LiveBoardEntry, LiveExamBoard, LiveWritingEntry } from '@/lib/admin/live-dashboard-data';
import { attemptInLiveExamSession, liveSessionSince } from '@/lib/admin/live-exam-session';
import { resolveStoredPercent, testIdsMatch } from '@/lib/test-attempts';

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

export function isElevateXSchedule(schedule: ExamScheduleRow): boolean {
  return (
    isElevateXModule(schedule.test_id) ||
    isElevateXTestId(schedule.test_id) ||
    /elevatex/i.test(schedule.title ?? '')
  );
}

function isLiveForDashboard(schedule: ExamScheduleRow, now = Date.now()): boolean {
  if (schedule.status === 'ended') return false;

  const resolved = resolveExamScheduleStatus(schedule, now);
  if (resolved.display === 'window_ended' || resolved.display === 'ended') return false;
  if (resolved.display === 'live' || isScheduleLiveNow(schedule, now)) return true;

  // Scheduled slot inside its window (students may already be on /placement/take).
  if (schedule.status === 'scheduled') {
    const start = scheduleStartMs(schedule.starts_at);
    const end = scheduleEndMs(schedule.ends_at);
    if (start <= now && (end === null || end >= now)) return true;
  }

  return false;
}

/** When no schedule passes the live filter, attach the current DB live ElevateX module only (no stale-activity fallback). */
export async function ensureElevateXLiveScheduleFallback(
  live: ExamScheduleRow[],
): Promise<ExamScheduleRow[]> {
  if (live.length > 0) return live;

  const now = Date.now();
  const module = await prisma.evaloraModuleSchedule.findFirst({
    where: {
      moduleKey: ELEVATEX_MODULE_KEY,
      status: { in: ['live', 'scheduled'] },
    },
    orderBy: { startsAt: 'desc' },
  });

  if (!module) return live;

  const mapped: ExamScheduleRow = {
    id: module.id,
    title: module.title?.trim() || ELEVATEX_EXAM_NAME,
    description: null,
    notice: module.notice ?? null,
    faculty_exam_request_id: null,
    test_id: module.moduleKey,
    status: module.status === 'live' ? 'live' : 'scheduled',
    starts_at: module.startsAt.toISOString(),
    ends_at: module.endsAt?.toISOString() ?? null,
    target_departments: Array.isArray(module.targetDepartments)
      ? (module.targetDepartments as string[])
      : [],
    target_years: Array.isArray(module.targetYears) ? (module.targetYears as string[]) : [],
    slot_number: null,
    slot_capacity: null,
    created_by: module.createdBy ?? null,
    created_at: module.createdAt.toISOString(),
    updated_at: module.updatedAt.toISOString(),
  };
  return isLiveForDashboard(mapped, now) ? [mapped] : live;
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

  const sorted = live.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  return ensureElevateXLiveScheduleFallback(sorted);
}

/** Prefer completed attempts over stale in-progress autosave / heartbeat rows. */
function pickBetterAttempt(prev: RollupAttempt, next: RollupAttempt): RollupAttempt {
  const prevDone = isCompletedAttemptStatus(prev.status, prev.completed_at);
  const nextDone = isCompletedAttemptStatus(next.status, next.completed_at);
  if (prevDone && !nextDone) return prev;
  if (!prevDone && nextDone) return next;
  const prevAt = new Date(prev.completed_at ?? prev.created_at).getTime();
  const nextAt = new Date(next.completed_at ?? next.created_at).getTime();
  return nextAt >= prevAt ? next : prev;
}

function attemptMatchesSchedule(attempt: RollupAttempt, schedule: ExamScheduleRow): boolean {
  const testId = String(schedule.test_id ?? '').trim();
  if (testId && attempt.test_id && testIdsMatch(attempt.test_id, testId)) return true;
  if (isElevateXModule(testId) || isElevateXTestId(testId)) {
    if (attempt.test_id && isElevateXTestId(attempt.test_id)) return true;
    if (isElevateXAttemptTitle(attempt.test_name)) return true;
  }
  const title = schedule.title?.toLowerCase() ?? '';
  if (title.length > 2 && attempt.test_name.toLowerCase().includes(title)) return true;
  if (isElevateXSchedule(schedule) && isElevateXAttemptTitle(attempt.test_name)) return true;
  return false;
}

function toBoardEntry(
  attempt: RollupAttempt,
  student: { roll_number: string; full_name: string | null; email: string },
  rank: number,
): LiveBoardEntry {
  const submitted = isCompletedAttemptStatus(attempt.status, attempt.completed_at);
  const writing = isInProgressStatus(attempt.status) && !submitted;
  return {
    attempt_id: attempt.id,
    user_id: attempt.user_id,
    roll_number: student.roll_number,
    student_name: student.full_name?.trim() || student.email || 'Student',
    score: writing ? attempt.score : attempt.score,
    status: writing ? 'in_progress' : attempt.status,
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

  let matched = allAttempts.filter(
    (a) =>
      attemptMatchesSchedule(a, schedule) &&
      attemptInLiveExamSession(
        { created_at: a.created_at, completed_at: a.completed_at },
        schedule,
      ),
  );

  // Pull fresh in-progress ElevateX rows (autosave) even if rollup cache is stale.
  if (isElevateXSchedule(schedule)) {
    const since = liveSessionSince(schedule);
    const liveRows = await prisma.testAttempt.findMany({
      where: {
        createdAt: { gte: since },
        OR: [
          { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
          { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    for (const row of liveRows) {
      const created_at = row.createdAt.toISOString();
      const completed_at = row.completedAt?.toISOString() ?? null;
      if (!attemptInLiveExamSession({ created_at, completed_at }, schedule)) continue;

      const status = String(row.status ?? '').toLowerCase();
      const score = resolveStoredPercent(
        row.percentageScore != null ? Number(row.percentageScore) : null,
        row.score != null ? Number(row.score) : null,
        row.totalScore != null ? Number(row.totalScore) : null,
      );
      matched.push({
        id: row.id,
        user_id: row.userId,
        test_id: row.testId,
        test_name: row.testTitle ?? ELEVATEX_EXAM_NAME,
        score,
        status: status || (row.completedAt ? 'completed' : 'in_progress'),
        created_at,
        completed_at,
        time_taken: row.timeTaken,
        source: 'test_attempts',
      });
    }
  }

  const latestByUser = new Map<string, RollupAttempt>();
  for (const a of matched) {
    const prev = latestByUser.get(a.user_id);
    latestByUser.set(a.user_id, prev ? pickBetterAttempt(prev, a) : a);
  }

  const sorted = Array.from(latestByUser.values()).sort((a, b) => {
    const aDone = isCompletedAttemptStatus(a.status, a.completed_at);
    const bDone = isCompletedAttemptStatus(b.status, b.completed_at);
    if (aDone !== bDone) return aDone ? -1 : 1;
    return b.score - a.score;
  });
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
  options?: { sessionSubmittedUserIds?: Set<string> },
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

  const elevatexSchedule = schedules.find((s) => isElevateXSchedule(s));
  const sessionSince = elevatexSchedule ? liveSessionSince(elevatexSchedule) : null;
  const elevatexSubmitted = elevatexSchedule
    ? await prisma.testAttempt.findMany({
        where: {
          status: { in: ['completed', 'submitted'] },
          completedAt: { not: null, gte: sessionSince },
          createdAt: { gte: sessionSince },
          OR: [
            { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
            { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
          ],
        },
        select: { userId: true },
        distinct: ['userId'],
        take: 3000,
      })
    : [];
  const submittedUserIds =
    options?.sessionSubmittedUserIds ?? new Set(elevatexSubmitted.map((r) => r.userId));

  const students = await loadAdminStudentsPrisma();
  const studentById = new Map(students.map((s) => [s.id, s]));
  const schedule =
    schedules.find((s) => isElevateXSchedule(s)) ?? schedules[0] ?? null;

  for (const session of activeSessions) {
    if (submittedUserIds.has(session.userId)) continue;
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

/** Merge ElevateX autosave rows into live boards so leaderboard updates during the exam. */
export function mergeInProgressIntoLiveBoards(
  boards: LiveExamBoard[],
  inProgress: ElevateXInProgressRow[],
  submittedUserIds?: Set<string>,
): LiveExamBoard[] {
  if (!inProgress.length) return boards;

  return boards.map((board) => {
    if (!isElevateXSchedule(board.schedule)) return board;

    const entries = [...board.entries];
    const byUser = new Map(entries.map((e) => [e.user_id, e]));

    for (const row of inProgress) {
      if (submittedUserIds?.has(row.user_id)) continue;
      const existing = byUser.get(row.user_id);
      if (existing?.submitted_at) continue;
      if (existing) {
        if (!existing.submitted_at) {
          existing.score = Math.max(existing.score, row.partial_score);
          existing.status = 'in_progress';
          existing.updated_at = row.updated_at;
        }
        continue;
      }
      const entry: LiveBoardEntry = {
        attempt_id: row.attempt_id,
        user_id: row.user_id,
        roll_number: row.roll_number,
        student_name: row.student_name,
        score: row.partial_score,
        status: 'in_progress',
        submitted_at: null,
        updated_at: row.updated_at,
        rank: entries.length + 1,
      };
      entries.push(entry);
      byUser.set(row.user_id, entry);
    }

    entries.sort((a, b) => {
      if (Boolean(a.submitted_at) !== Boolean(b.submitted_at)) {
        return a.submitted_at ? -1 : 1;
      }
      return b.score - a.score || a.roll_number.localeCompare(b.roll_number);
    });
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    const submitted = entries.filter((e) => e.submitted_at);
    const top = submitted[0] ?? entries.find((e) => !e.submitted_at) ?? null;

    return {
      ...board,
      entries,
      submitted_count: submitted.length,
      in_progress_count: entries.length - submitted.length,
      highest_score: entries.length ? Math.max(...entries.map((e) => e.score)) : 0,
      top_scorer: top
        ? {
            student_name: top.student_name,
            roll_number: top.roll_number,
            score: top.score,
          }
        : null,
    };
  });
}

export function mergeInProgressIntoWritingNow(
  writing: LiveWritingEntry[],
  inProgress: ElevateXInProgressRow[],
  schedules: ExamScheduleRow[],
  submittedUserIds?: Set<string>,
): LiveWritingEntry[] {
  const schedule =
    schedules.find((s) => isElevateXSchedule(s)) ?? schedules[0] ?? null;
  if (!schedule) return writing;

  const rows = [...writing];
  const seen = new Set(rows.map((r) => r.user_id));

  for (const row of inProgress) {
    if (submittedUserIds?.has(row.user_id)) continue;
    if (seen.has(row.user_id)) {
      const existing = rows.find((r) => r.user_id === row.user_id);
      if (existing?.submitted_at) continue;
      if (existing && !existing.submitted_at) {
        existing.score = Math.max(existing.score, row.partial_score);
        existing.updated_at = row.updated_at;
      }
      continue;
    }
    seen.add(row.user_id);
    rows.push({
      attempt_id: row.attempt_id,
      user_id: row.user_id,
      roll_number: row.roll_number,
      student_name: row.student_name,
      score: row.partial_score,
      status: 'in_progress',
      submitted_at: null,
      updated_at: row.updated_at,
      rank: rows.length + 1,
      schedule_id: schedule.id,
      schedule_title: schedule.title,
      test_title: schedule.title,
    });
  }

  return rows;
}
