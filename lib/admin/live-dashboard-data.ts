import type { DbServiceClient } from '@/lib/db/get-db-service';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { loadAdminStudents, loadAllAttemptsRollup, type RollupAttempt } from '@/lib/admin/attempts-rollup';
import { isCompletedAttemptStatus, isInProgressStatus } from '@/lib/attempt-status';
import {
  isScheduleLiveNow,
  resolveExamScheduleStatus,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { syncExpiredLiveExamSchedules } from '@/lib/exam-schedule-sync';
import type { EvaloraModuleScheduleRow } from '@/lib/evalora/module-schedule';
import { isStudentSessionLockSchemaError } from '@/lib/ensure-student-session-lock';
import { isElevateXModule, isElevateXAttemptTitle, isElevateXTestId } from '@/lib/elevatex';
import { parseElevateXScorecardFromAnswers } from '@/lib/placement/scorecard-payload';
import { resolveStoredPercent, testIdsMatch } from '@/lib/test-attempts';

/** Active login within this window counts as "currently writing" when no attempt row exists yet. */
const RECENT_ACTIVE_WRITER_MS = 10 * 60 * 1000;

export type LiveBoardEntry = {
  attempt_id: string;
  user_id: string;
  roll_number: string;
  student_name: string;
  score: number;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  rank: number;
};

export type LiveExamBoard = {
  schedule: ExamScheduleRow;
  test_title: string;
  entries: LiveBoardEntry[];
  submitted_count: number;
  in_progress_count: number;
  highest_score: number;
  top_scorer: Pick<LiveBoardEntry, 'student_name' | 'roll_number' | 'score'> | null;
};

/** Student currently in an exam (not yet submitted), tagged with which live test. */
export type LiveWritingEntry = LiveBoardEntry & {
  schedule_id: string;
  schedule_title: string;
  test_title: string;
};

export async function buildAllLiveExamBoards(
  admin: DbServiceClient,
  schedules: ExamScheduleRow[],
  preloadedAttempts?: RollupAttempt[],
): Promise<LiveExamBoard[]> {
  return Promise.all(
    schedules.map((schedule) => buildLiveExamBoard(admin, schedule, preloadedAttempts)),
  );
}

export async function buildAllLiveWritingActivity(
  admin: DbServiceClient,
  schedules: ExamScheduleRow[],
  preloadedAttempts?: RollupAttempt[],
): Promise<LiveWritingEntry[]> {
  const rows: LiveWritingEntry[] = [];
  const seenUserIds = new Set<string>();

  for (const schedule of schedules) {
    const board = await buildLiveExamBoard(admin, schedule, preloadedAttempts);
    for (const entry of board.entries) {
      if (entry.submitted_at) continue;
      seenUserIds.add(entry.user_id);
      rows.push({
        ...entry,
        schedule_id: schedule.id,
        schedule_title: schedule.title,
        test_title: board.test_title,
      });
    }
  }

  const sessionWriters = await loadActiveSessionWriters(admin, schedules, seenUserIds);
  rows.push(...sessionWriters);

  return rows.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/^department\s*·\s*/i, '')
    .trim();
}

function titleKeysForSchedule(schedule: ExamScheduleRow, facultyTitle?: string | null): string[] {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const n = normalizeTitle(String(value ?? ''));
    if (n) keys.add(n);
  };
  add(schedule.title);
  add(facultyTitle);
  if (facultyTitle) add(`department · ${facultyTitle}`);
  return Array.from(keys);
}

function scheduleSessionBounds(schedule: ExamScheduleRow): { startMs: number; endMs: number | null } {
  const startMs = new Date(schedule.starts_at).getTime();
  const endMs = schedule.ends_at ? new Date(schedule.ends_at).getTime() : null;
  return {
    startMs: Number.isNaN(startMs) ? 0 : startMs,
    endMs: endMs !== null && !Number.isNaN(endMs) ? endMs : null,
  };
}

/** Attempt must belong to this scheduled live window — not older runs of the same test. */
function attemptInLiveSession(
  attempt: RollupAttempt,
  schedule: ExamScheduleRow,
  now = Date.now(),
): boolean {
  const { startMs, endMs } = scheduleSessionBounds(schedule);
  const attemptMs = new Date(attempt.created_at).getTime();
  if (Number.isNaN(attemptMs)) return false;

  const status = String(attempt.status ?? '').toLowerCase();
  const isActive =
    status === 'in_progress' || status === 'started' || status === 'active';
  const isDone =
    status === 'completed' ||
    status === 'submitted' ||
    Boolean(attempt.completed_at);

  if ((isActive || isDone) && isScheduleLiveNow(schedule, now)) {
    const recentCutoff = now - 6 * 60 * 60 * 1000;
    const anchorMs = attempt.completed_at
      ? new Date(attempt.completed_at).getTime()
      : attemptMs;
    if (!Number.isNaN(anchorMs) && anchorMs >= recentCutoff) return true;
  }

  if (attemptMs < startMs - 60_000) return false;
  if (endMs !== null && attemptMs > endMs + 120_000) return false;
  return true;
}

function attemptMatchesLiveSchedule(
  attempt: RollupAttempt,
  schedule: ExamScheduleRow,
  titleKeys: string[],
): boolean {
  if (!attemptInLiveSession(attempt, schedule)) return false;

  const scheduleTestId = String(schedule.test_id ?? '').trim();

  if (scheduleTestId && attempt.test_id && testIdsMatch(attempt.test_id, scheduleTestId)) {
    return true;
  }

  if (isElevateXModule(scheduleTestId) || isElevateXTestId(scheduleTestId)) {
    if (attempt.test_id && isElevateXTestId(attempt.test_id)) return true;
    if (isElevateXAttemptTitle(attempt.test_name)) return true;
  }

  const attemptTitle = normalizeTitle(attempt.test_name);
  if (!attemptTitle) return false;

  for (const key of titleKeys) {
    if (!key) continue;
    if (attemptTitle === key) return true;
    if (attemptTitle.includes(key) || key.includes(attemptTitle)) return true;
  }

  return false;
}

function latestAttemptPerUser(attempts: RollupAttempt[]): RollupAttempt[] {
  const byUser = new Map<string, RollupAttempt>();
  for (const attempt of attempts) {
    const existing = byUser.get(attempt.user_id);
    if (!existing) {
      byUser.set(attempt.user_id, attempt);
      continue;
    }
    const existingMs = new Date(existing.created_at).getTime();
    const attemptMs = new Date(attempt.created_at).getTime();
    if (attemptMs >= existingMs) byUser.set(attempt.user_id, attempt);
  }
  return Array.from(byUser.values());
}

function scoreFromAttemptRow(row: Record<string, unknown>): number {
  const base = resolveStoredPercent(
    row.percentage_score != null ? Number(row.percentage_score) : null,
    row.score != null ? Number(row.score) : null,
    row.total_score != null ? Number(row.total_score) : null,
  );
  if (base > 0) return base;
  const scorecard = parseElevateXScorecardFromAnswers(row.answers);
  if (scorecard && typeof scorecard.percentage === 'number') {
    return scorecard.percentage;
  }
  return base;
}

function rowToRollupAttempt(
  row: Record<string, unknown>,
  fallbackTitle: string,
): RollupAttempt {
  const created = String(row.created_at ?? row.started_at ?? new Date().toISOString());
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    test_id: row.test_id != null ? String(row.test_id) : null,
    test_name: String(row.test_title ?? fallbackTitle),
    score: scoreFromAttemptRow(row),
    status: String(row.status ?? 'completed'),
    created_at: created,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    time_taken: row.time_taken != null ? Number(row.time_taken) : null,
    source: 'test_attempts',
  };
}

async function loadAttemptsForSchedule(
  admin: DbServiceClient,
  schedule: ExamScheduleRow,
  titleKeys: string[],
): Promise<RollupAttempt[]> {
  const byId = new Map<string, RollupAttempt>();
  const add = (row: RollupAttempt) => {
    if (attemptMatchesLiveSchedule(row, schedule, titleKeys)) {
      byId.set(row.id, row);
    }
  };

  const sessionStartIso = new Date(scheduleSessionBounds(schedule).startMs - 60_000).toISOString();
  const sessionEndMs = scheduleSessionBounds(schedule).endMs;
  const sessionEndIso =
    sessionEndMs !== null
      ? new Date(sessionEndMs + 120_000).toISOString()
      : null;

  const scheduleTestId = String(schedule.test_id ?? '').trim();

  if (scheduleTestId) {
    let query = admin
      .from('test_attempts')
      .select('*')
      .eq('test_id', scheduleTestId)
      .gte('created_at', sessionStartIso)
      .order('created_at', { ascending: false })
      .limit(500);

    if (sessionEndIso) {
      query = query.lte('created_at', sessionEndIso);
    }

    const { data: byTestId } = await query;
    for (const row of byTestId ?? []) {
      add(rowToRollupAttempt(row as Record<string, unknown>, schedule.title));
    }

    let inProgressQuery = admin
      .from('test_attempts')
      .select('*')
      .eq('test_id', scheduleTestId)
      .in('status', ['in_progress', 'started', 'active'])
      .order('created_at', { ascending: false })
      .limit(300);

    const { data: inProgressRows } = await inProgressQuery;
    for (const row of inProgressRows ?? []) {
      add(rowToRollupAttempt(row as Record<string, unknown>, schedule.title));
    }
  }

  // ElevateX legacy ids (placement-*) during this session only
  if (isElevateXModule(scheduleTestId) || isElevateXTestId(scheduleTestId)) {
    let legacyQuery = admin
      .from('test_attempts')
      .select('*')
      .like('test_id', 'placement-%')
      .gte('created_at', sessionStartIso)
      .order('created_at', { ascending: false })
      .limit(300);

    if (sessionEndIso) {
      legacyQuery = legacyQuery.lte('created_at', sessionEndIso);
    }

    const { data: legacyRows } = await legacyQuery;
    for (const row of legacyRows ?? []) {
      add(rowToRollupAttempt(row as Record<string, unknown>, schedule.title));
    }
  }

  const { attempts: rollupAttempts } = await loadAllAttemptsRollup(admin);
  for (const attempt of rollupAttempts) {
    add(attempt);
  }

  return latestAttemptPerUser(
    Array.from(byId.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  );
}

async function loadActiveSessionWriters(
  admin: DbServiceClient,
  schedules: ExamScheduleRow[],
  excludeUserIds: Set<string>,
  studentById?: Map<string, { roll_number: string; full_name: string | null; email: string }>,
): Promise<LiveWritingEntry[]> {
  if (schedules.length === 0) return [];

  const cutoff = new Date(Date.now() - RECENT_ACTIVE_WRITER_MS).toISOString();
  const { data, error } = await admin
    .from('student_active_sessions')
    .select('roll_number, user_id, last_seen_at')
    .gte('last_seen_at', cutoff);

  if (error) {
    if (isStudentSessionLockSchemaError(error)) return [];
    return [];
  }

  const schedule = schedules[0];
  const userIds = (data ?? [])
    .map((row) => String(row.user_id ?? ''))
    .filter((id) => id && !excludeUserIds.has(id));

  if (userIds.length === 0) return [];

  const students =
    studentById ??
    new Map((await loadAdminStudents(admin)).map((s) => [s.id, s]));

  const usersById = new Map<
    string,
    { full_name: string | null; email: string; metadata?: Record<string, unknown>; roll_number?: string }
  >();

  for (const uid of userIds) {
    const student = students.get(uid);
    if (student) {
      usersById.set(uid, {
        email: student.email,
        full_name: student.full_name,
        roll_number: student.roll_number,
      });
    }
  }

  const missingIds = userIds.filter((id) => !usersById.has(id));
  if (missingIds.length) {
    const { data: users } = await admin
      .from('users')
      .select('id, email, full_name')
      .in('id', missingIds);

    for (const u of users ?? []) {
      usersById.set(u.id as string, {
        email: String(u.email ?? ''),
        full_name: (u.full_name as string | null) ?? null,
      });
    }

    for (const uid of missingIds) {
      if (usersById.has(uid)) continue;
      const { data: authUser } = await admin.auth.admin.getUserById(uid);
      if (authUser?.user) {
        usersById.set(uid, {
          email: authUser.user.email ?? '',
          full_name: (() => {
            const meta = authUser.user.user_metadata as Record<string, unknown>;
            return (
              (typeof meta.full_name === 'string' ? meta.full_name : null) ??
              (typeof meta.name === 'string' ? meta.name : null)
            );
          })(),
          metadata: authUser.user.user_metadata as Record<string, unknown>,
        });
      }
    }
  }

  const sessionByUser = new Map(
    (data ?? []).map((row) => [String(row.user_id), row as Record<string, unknown>]),
  );

  return userIds.map((userId, index) => {
    const sessionRow = sessionByUser.get(userId);
    const user = usersById.get(userId);
    const student = students.get(userId);
    const email = user?.email ?? student?.email ?? '';
    const roll =
      student?.roll_number ||
      user?.roll_number ||
      rollNumberFromUser(email, user?.metadata) ||
      String(sessionRow?.roll_number ?? '');
    const lastSeen = String(sessionRow?.last_seen_at ?? new Date().toISOString());
    return {
      attempt_id: `session-${userId}`,
      user_id: userId,
      roll_number: roll,
      student_name:
        student?.full_name?.trim() ||
        user?.full_name?.trim() ||
        roll ||
        email ||
        'Student',
      score: 0,
      status: 'in_progress',
      submitted_at: null,
      updated_at: lastSeen,
      rank: index + 1,
      schedule_id: schedule.id,
      schedule_title: schedule.title,
      test_title: schedule.title,
    };
  });
}

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
    created_by: null,
    created_at: row.starts_at,
    updated_at: row.starts_at,
  };
}

function isLiveForDashboard(
  schedule: Pick<ExamScheduleRow, 'status' | 'starts_at' | 'ends_at'>,
  now = Date.now(),
): boolean {
  const resolved = resolveExamScheduleStatus(schedule, now);
  return resolved.display === 'live' && resolved.windowOpen && isScheduleLiveNow(schedule, now);
}

export async function listLiveExamSchedules(admin: DbServiceClient): Promise<ExamScheduleRow[]> {
  const now = Date.now();
  const live: ExamScheduleRow[] = [];

  const { data: scheduleRows } = await admin
    .from('exam_schedules')
    .select('*')
    .neq('status', 'ended')
    .order('starts_at', { ascending: false });

  let schedules = (scheduleRows ?? []) as ExamScheduleRow[];
  if (schedules.length > 0) {
    schedules = await syncExpiredLiveExamSchedules(admin, schedules);
  }

  for (const row of schedules) {
    if (isLiveForDashboard(row, now)) live.push(row);
  }

  const { data: evaloraRows } = await admin
    .from('evalora_module_schedules')
    .select('*')
    .neq('status', 'ended')
    .order('starts_at', { ascending: false });

  for (const row of (evaloraRows ?? []) as EvaloraModuleScheduleRow[]) {
    const mapped = evaloraToExamSchedule(row);
    if (isLiveForDashboard(mapped, now)) live.push(mapped);
  }

  return live.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

const DEFAULT_ENDED_LOOKBACK_MS = 48 * 60 * 60 * 1000;

function isRecentlyEndedSchedule(
  schedule: Pick<ExamScheduleRow, 'starts_at' | 'ends_at' | 'status'>,
  now = Date.now(),
  lookbackMs = DEFAULT_ENDED_LOOKBACK_MS,
): boolean {
  const resolved = resolveExamScheduleStatus(schedule, now);
  if (resolved.display === 'live') return false;
  if (resolved.display === 'scheduled') return false;

  const endMs = schedule.ends_at ? new Date(schedule.ends_at).getTime() : null;
  if (endMs === null || Number.isNaN(endMs)) return false;
  if (endMs > now) return false;
  return endMs >= now - lookbackMs;
}

export async function listRecentlyEndedExamSchedules(
  admin: DbServiceClient,
  lookbackMs = DEFAULT_ENDED_LOOKBACK_MS,
): Promise<ExamScheduleRow[]> {
  const now = Date.now();
  const ended: ExamScheduleRow[] = [];

  let scheduleRows = ((await admin
    .from('exam_schedules')
    .select('*')
    .order('ends_at', { ascending: false })).data ?? []) as ExamScheduleRow[];

  if (scheduleRows.length) {
    scheduleRows = await syncExpiredLiveExamSchedules(admin, scheduleRows);
  }

  for (const row of scheduleRows) {
    if (isRecentlyEndedSchedule(row, now, lookbackMs)) ended.push(row);
  }

  const { data: evaloraRows } = await admin
    .from('evalora_module_schedules')
    .select('*')
    .order('ends_at', { ascending: false });

  for (const row of (evaloraRows ?? []) as EvaloraModuleScheduleRow[]) {
    const mapped = evaloraToExamSchedule(row);
    if (isRecentlyEndedSchedule(mapped, now, lookbackMs)) ended.push(mapped);
  }

  return ended.sort(
    (a, b) => new Date(b.ends_at ?? b.starts_at).getTime() - new Date(a.ends_at ?? a.starts_at).getTime(),
  );
}

export async function buildLiveExamBoard(
  admin: DbServiceClient,
  schedule: ExamScheduleRow,
  _preloadedAttempts?: RollupAttempt[],
): Promise<LiveExamBoard> {
  const testId = String(schedule.test_id);

  let facultyTitle: string | null = null;
  if (schedule.faculty_exam_request_id) {
    const { data: facultyRow } = await admin
      .from('faculty_exam_requests')
      .select('title, published_test_id')
      .eq('id', schedule.faculty_exam_request_id)
      .maybeSingle();
    facultyTitle = (facultyRow?.title as string | null) ?? null;
  }

  const titleKeys = titleKeysForSchedule(schedule, facultyTitle);
  const matched = await loadAttemptsForSchedule(admin, schedule, titleKeys);

  const students = await loadAdminStudents(admin);
  const studentById = new Map(students.map((s) => [s.id, s]));

  const userIds = [...new Set(matched.map((a) => a.user_id))];
  const usersById = new Map<
    string,
    { full_name: string | null; email: string; metadata?: Record<string, unknown>; roll_number?: string }
  >();

  for (const student of students) {
    if (userIds.includes(student.id)) {
      usersById.set(student.id, {
        email: student.email,
        full_name: student.full_name,
        roll_number: student.roll_number,
      });
    }
  }

  if (userIds.length) {
    const missingIds = userIds.filter((id) => !usersById.has(id));
    if (missingIds.length) {
      const { data: users } = await admin
        .from('users')
        .select('id, email, full_name')
        .in('id', missingIds);

      for (const u of users ?? []) {
        usersById.set(u.id as string, {
          email: String(u.email ?? ''),
          full_name: (u.full_name as string | null) ?? null,
        });
      }

      for (const uid of missingIds) {
        if (usersById.has(uid)) continue;
        const { data: authUser } = await admin.auth.admin.getUserById(uid);
        if (authUser?.user) {
          usersById.set(uid, {
            email: authUser.user.email ?? '',
            full_name: (() => {
              const meta = authUser.user.user_metadata as Record<string, unknown>;
              return (
                (typeof meta.full_name === 'string' ? meta.full_name : null) ??
                (typeof meta.name === 'string' ? meta.name : null)
              );
            })(),
            metadata: authUser.user.user_metadata as Record<string, unknown>,
          });
        }
      }
    }
  }

  let testTitle = schedule.title;
  const { data: testRow } = await admin
    .from('tests')
    .select('title, name')
    .eq('id', testId)
    .maybeSingle();
  if (testRow) {
    testTitle = String(testRow.title ?? testRow.name ?? schedule.title);
  } else if (facultyTitle) {
    testTitle = facultyTitle;
  }

  const completedAttempts = matched
    .filter((a) => isCompletedAttemptStatus(a.status, a.completed_at))
    .sort((a, b) => b.score - a.score || new Date(a.completed_at ?? a.created_at).getTime() - new Date(b.completed_at ?? b.created_at).getTime());

  const inProgressAttempts = matched
    .filter((a) => isInProgressStatus(a.status) && !a.completed_at)
    .sort((a, b) => b.score - a.score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const sorted = [...completedAttempts, ...inProgressAttempts];

  const entries: LiveBoardEntry[] = sorted.map((a, index) => {
    const user = usersById.get(a.user_id);
    const student = studentById.get(a.user_id);
    const email = user?.email ?? student?.email ?? '';
    const roll =
      student?.roll_number ||
      user?.roll_number ||
      rollNumberFromUser(email, user?.metadata);
    const isDone = isCompletedAttemptStatus(a.status, a.completed_at);
    const displayName =
      student?.full_name?.trim() ||
      user?.full_name?.trim() ||
      roll ||
      email ||
      'Student';
    return {
      attempt_id: a.id,
      user_id: a.user_id,
      roll_number: roll,
      student_name: displayName,
      score: a.score,
      status: isDone ? 'completed' : a.status,
      submitted_at: isDone ? a.completed_at ?? a.created_at : null,
      updated_at: a.completed_at ?? a.created_at,
      rank: index + 1,
    };
  });

  const sessionWriters = await loadActiveSessionWriters(
    admin,
    [schedule],
    new Set(entries.map((e) => e.user_id)),
    studentById,
  );

  const highest_score = entries.length ? Math.max(...entries.map((e) => e.score)) : 0;
  const topEntry = entries[0] ?? null;
  const top_scorer = topEntry
    ? {
        student_name: topEntry.student_name,
        roll_number: topEntry.roll_number,
        score: topEntry.score,
      }
    : null;

  for (const writer of sessionWriters) {
    entries.push({
      attempt_id: writer.attempt_id,
      user_id: writer.user_id,
      roll_number: writer.roll_number,
      student_name: writer.student_name,
      score: writer.score,
      status: writer.status,
      submitted_at: null,
      updated_at: writer.updated_at,
      rank: entries.length + 1,
    });
  }

  return {
    schedule,
    test_title: testTitle,
    entries,
    submitted_count: entries.filter((e) => e.submitted_at).length,
    in_progress_count: entries.filter((e) => !e.submitted_at).length,
    highest_score,
    top_scorer,
  };
}
