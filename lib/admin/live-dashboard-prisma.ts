import { prisma } from '@/lib/prisma';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { isScheduleLiveNow, resolveExamScheduleStatus } from '@/lib/exam-schedule';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import {
  ELEVATEX_EXAM_NAME,
  ELEVATEX_MODULE_KEY,
  isElevateXAttemptTitle,
  isElevateXModule,
  isElevateXTestId,
} from '@/lib/elevatex';
import { isInProgressStatus } from '@/lib/attempt-status';
import { scheduleEndMs, scheduleStartMs } from '@/lib/exam-schedule';
import {
  loadAdminStudentsPrisma,
  loadAllAttemptsRollupPrisma,
} from '@/lib/admin/attempts-rollup-prisma';
import type { RollupAttempt } from '@/lib/admin/attempts-rollup';
import type { LiveBoardEntry, LiveExamBoard, LiveWritingEntry } from '@/lib/admin/live-dashboard-data';
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

function isElevateXSchedule(schedule: ExamScheduleRow): boolean {
  return (
    isElevateXModule(schedule.test_id) ||
    isElevateXTestId(schedule.test_id) ||
    /elevatex/i.test(schedule.title ?? '')
  );
}

function isLiveForDashboard(schedule: ExamScheduleRow, now = Date.now()): boolean {
  if (schedule.status === 'ended') return false;

  // ElevateX: if admin marked live, always show command centre (clock skew / ends_at bugs should not hide the board).
  if (schedule.status === 'live' && isElevateXSchedule(schedule)) return true;

  const resolved = resolveExamScheduleStatus(schedule, now);
  if (resolved.display === 'live' || isScheduleLiveNow(schedule, now)) return true;

  // Scheduled slot inside its window (students may already be on /placement/take).
  if (schedule.status === 'scheduled') {
    const start = scheduleStartMs(schedule.starts_at);
    const end = scheduleEndMs(schedule.ends_at);
    if (start <= now && (end === null || end >= now)) return true;
  }

  return false;
}

/** When no schedule passes the live filter but students are active, still drive the live board. */
export async function ensureElevateXLiveScheduleFallback(
  live: ExamScheduleRow[],
): Promise<ExamScheduleRow[]> {
  if (live.length > 0) return live;

  const module = await prisma.evaloraModuleSchedule.findFirst({
    where: {
      moduleKey: ELEVATEX_MODULE_KEY,
      status: { in: ['live', 'scheduled'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (module) {
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
    return [mapped];
  }

  const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const recentActivity = await prisma.testAttempt.count({
    where: {
      createdAt: { gte: since },
      OR: [
        { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
        { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
      ],
    },
  });

  const heartbeatCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentHeartbeats = await prisma.studentActiveSession.count({
    where: { lastHeartbeat: { gte: heartbeatCutoff } },
  });

  if (recentActivity === 0 && recentHeartbeats === 0) return live;

  const nowIso = new Date().toISOString();
  return [
    {
      id: 'elevatex-activity-fallback',
      title: ELEVATEX_EXAM_NAME,
      description: null,
      notice: null,
      faculty_exam_request_id: null,
      test_id: ELEVATEX_MODULE_KEY,
      status: 'live',
      starts_at: nowIso,
      ends_at: null,
      target_departments: [],
      target_years: [],
      slot_number: null,
      slot_capacity: null,
      created_by: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
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

function attemptMatchesSchedule(attempt: RollupAttempt, schedule: ExamScheduleRow): boolean {
  if (schedule.id === 'elevatex-activity-fallback') {
    return isElevateXAttemptTitle(attempt.test_name) || isElevateXTestId(attempt.test_id);
  }

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

  let matched = allAttempts.filter((a) => attemptMatchesSchedule(a, schedule));

  // Pull fresh in-progress ElevateX rows (autosave) even if rollup cache is stale.
  if (isElevateXSchedule(schedule)) {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
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
        created_at: row.createdAt.toISOString(),
        completed_at: row.completedAt?.toISOString() ?? null,
        time_taken: row.timeTaken,
        source: 'test_attempts',
      });
    }
  }

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
  const schedule =
    schedules.find((s) => isElevateXSchedule(s)) ?? schedules[0] ?? null;

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
