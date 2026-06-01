import type { DbServiceClient } from '@/lib/db/get-db-service';
import { COLLEGE } from '@/lib/college-brand';
import { studentAuthEmail } from '@/lib/college-auth';
import { ELEVATEX_MODULE_KEY, isElevateXAttemptTitle, isElevateXTestId } from '@/lib/elevatex';
import {
  allElevateXSampleRolls,
  ELEVATEX_SAMPLE_PASSWORD,
  ELEVATEX_SAMPLE_SLOT,
  ELEVATEX_SAMPLE_STUDENTS,
  LEGACY_ELEVATEX_SAMPLE_ROLLS,
  type ElevateXSampleStudent,
} from '@/lib/elevatex-sample-credentials';
import { normalizeRoll } from '@/lib/exam-schedule-slots';

/** Slot 1 window: 10:00–12:00 IST on the given calendar day (YYYY-MM-DD). */
export function getElevateXSlot1ScheduleWindow(dateIso: string): {
  startsAt: string;
  endsAt: string;
  label: string;
} {
  const startsAt = new Date(`${dateIso}T10:00:00+05:30`).toISOString();
  const endsAt = new Date(`${dateIso}T12:00:00+05:30`).toISOString();
  return {
    startsAt,
    endsAt,
    label: `Slot ${ELEVATEX_SAMPLE_SLOT} · ${dateIso} · 10:00–12:00 IST`,
  };
}

function todayIsoInIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function upsertAuthStudent(
  db: DbServiceClient,
  email: string,
  password: string,
  metadata: Record<string, string>,
  usersByEmail: Map<string, { id: string }>,
): Promise<{ id: string; created: boolean } | { error: string }> {
  const existing = usersByEmail.get(email.toLowerCase());

  if (existing?.id) {
    const { error: updateError } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updateError) return { error: updateError.message };
    return { id: existing.id, created: false };
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (createError || !created.user?.id) {
    return { error: createError?.message ?? 'Failed to create user' };
  }
  usersByEmail.set(email.toLowerCase(), { id: created.user.id });
  return { id: created.user.id, created: true };
}

async function upsertStudentProfile(
  db: DbServiceClient,
  userId: string,
  email: string,
  student: ElevateXSampleStudent,
): Promise<string | null> {
  const { error } = await db.from('users').upsert(
    {
      id: userId,
      email,
      full_name: student.fullName,
      branch: student.department,
      academic_year: student.year,
      user_role: 'student',
      college: COLLEGE.shortName,
      subscription_status: 'free',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  return error?.message ?? null;
}

async function loadAuthUsersByEmail(
  db: DbServiceClient,
): Promise<{ usersByEmail: Map<string, { id: string }> } | { error: string }> {
  const { data: listed, error: listError } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) return { error: listError.message };

  const usersByEmail = new Map<string, { id: string }>();
  for (const user of listed.users) {
    const email = (user.email ?? '').toLowerCase();
    if (email && user.id) usersByEmail.set(email, { id: user.id });
  }
  return { usersByEmail };
}

async function deleteRosterRowsForRoll(
  db: DbServiceClient,
  roll: string,
): Promise<void> {
  const rollNorm = normalizeRoll(roll);
  await db.from('student_active_sessions').delete().eq('roll_number', rollNorm);
  await db.from('exam_student_roster').delete().eq('roll_number', rollNorm);
  await db.from('exam_slot_roster_entries').delete().eq('roll_number', rollNorm);
}

async function deleteAttemptsForUserIds(
  db: DbServiceClient,
  userIds: string[],
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: attempts } = await db
    .from('test_attempts')
    .select('id')
    .in('user_id', userIds);

  const attemptIds = (attempts ?? []).map((row) => String(row.id)).filter(Boolean);
  if (attemptIds.length > 0) {
    await db.from('exam_violations').delete().in('attempt_id', attemptIds);
  }

  const { data: deleted } = await db
    .from('test_attempts')
    .delete()
    .in('user_id', userIds)
    .select('id');

  return deleted?.length ?? 0;
}

async function deleteSampleStudentByRoll(
  roll: string,
  usersByEmail: Map<string, { id: string }>,
  db: DbServiceClient,
): Promise<{ deleted: boolean; userId?: string; error?: string }> {
  const email = studentAuthEmail(roll).toLowerCase();
  const user = usersByEmail.get(email);
  if (!user?.id) {
    return { deleted: false };
  }

  await deleteRosterRowsForRoll(db, roll);

  const { error: delErr } = await db.auth.admin.deleteUser(user.id);
  if (delErr) {
    return { deleted: false, userId: user.id, error: delErr.message };
  }

  usersByEmail.delete(email);
  await db.from('users').delete().eq('id', user.id);

  return { deleted: true, userId: user.id };
}

async function deleteLegacySampleStudents(
  usersByEmail: Map<string, { id: string }>,
  db: DbServiceClient,
): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const errors: string[] = [];

  for (const roll of LEGACY_ELEVATEX_SAMPLE_ROLLS) {
    const outcome = await deleteSampleStudentByRoll(roll, usersByEmail, db);
    if (outcome.error) {
      errors.push(`${roll}: ${outcome.error}`);
      continue;
    }
    if (outcome.deleted) deleted.push(roll);
  }

  return { deleted, errors };
}

export type ElevateXResetResult = {
  deletedRolls: string[];
  notFoundRolls: string[];
  errors: string[];
  attemptsDeleted: number;
};

export type ElevateXAttemptsResetResult = {
  studentsFound: number;
  studentsMissing: string[];
  attemptsDeleted: number;
  violationsDeleted: number;
  sessionsCleared: number;
  errors: string[];
};

function attemptMatchesElevateX(row: { test_id?: unknown; test_title?: unknown }): boolean {
  if (isElevateXTestId(String(row.test_id ?? ''))) return true;
  return isElevateXAttemptTitle(String(row.test_title ?? ''));
}

/** Clear ElevateX attempts for demo students so they can take the paper again (keeps logins). */
export async function resetElevateXSampleAttempts(
  db: DbServiceClient,
): Promise<ElevateXAttemptsResetResult> {
  const loaded = await loadAuthUsersByEmail(db);
  if ('error' in loaded) {
    return {
      studentsFound: 0,
      studentsMissing: [],
      attemptsDeleted: 0,
      violationsDeleted: 0,
      sessionsCleared: 0,
      errors: [loaded.error],
    };
  }

  const { usersByEmail } = loaded;
  const userIds: string[] = [];
  const rollsFound: string[] = [];
  const studentsMissing: string[] = [];

  for (const roll of ELEVATEX_SAMPLE_STUDENTS.map((s) => s.roll)) {
    const email = studentAuthEmail(roll).toLowerCase();
    const user = usersByEmail.get(email);
    if (user?.id) {
      userIds.push(user.id);
      rollsFound.push(roll);
    } else {
      studentsMissing.push(roll);
    }
  }

  const errors: string[] = [];
  let attemptsDeleted = 0;
  let violationsDeleted = 0;
  let sessionsCleared = 0;

  for (const roll of rollsFound) {
    const rollNorm = normalizeRoll(roll);
    const { data: deletedSessions, error } = await db
      .from('student_active_sessions')
      .delete()
      .eq('roll_number', rollNorm);
    if (error) errors.push(`session ${roll}: ${error.message}`);
    else sessionsCleared += deletedSessions?.length ?? 0;
  }

  for (const userId of userIds) {
    const { data: attempts, error: fetchErr } = await db
      .from('test_attempts')
      .select('id, test_id, test_title')
      .eq('user_id', userId);

    if (fetchErr) {
      errors.push(`attempts ${userId}: ${fetchErr.message}`);
      continue;
    }

    const elevatexAttemptIds = (attempts ?? [])
      .filter((row) => attemptMatchesElevateX(row))
      .map((row) => String(row.id))
      .filter(Boolean);

    if (elevatexAttemptIds.length === 0) continue;

    const { error: violErr } = await db
      .from('exam_violations')
      .delete()
      .in('attempt_id', elevatexAttemptIds);
    if (violErr) errors.push(`violations ${userId}: ${violErr.message}`);
    else violationsDeleted += elevatexAttemptIds.length;

    const { data: deleted, error: delErr } = await db
      .from('test_attempts')
      .delete()
      .in('id', elevatexAttemptIds)
      .select('id');

    if (delErr) errors.push(`delete ${userId}: ${delErr.message}`);
    else attemptsDeleted += deleted?.length ?? 0;
  }

  return {
    studentsFound: userIds.length,
    studentsMissing,
    attemptsDeleted,
    violationsDeleted,
    sessionsCleared,
    errors,
  };
}

/** Remove all 42 ElevateX demo accounts (+ legacy rolls) so students can sign up again. */
export async function resetElevateXSampleStudents(
  db: DbServiceClient,
): Promise<ElevateXResetResult> {
  const loaded = await loadAuthUsersByEmail(db);
  if ('error' in loaded) {
    return {
      deletedRolls: [],
      notFoundRolls: [],
      errors: [loaded.error],
      attemptsDeleted: 0,
    };
  }

  const { usersByEmail } = loaded;
  const deletedRolls: string[] = [];
  const notFoundRolls: string[] = [];
  const errors: string[] = [];
  const userIdsToPurge: string[] = [];

  for (const roll of allElevateXSampleRolls()) {
    const outcome = await deleteSampleStudentByRoll(roll, usersByEmail, db);
    if (outcome.error) {
      errors.push(`${roll}: ${outcome.error}`);
      continue;
    }
    if (outcome.deleted) {
      deletedRolls.push(roll);
      if (outcome.userId) userIdsToPurge.push(outcome.userId);
    } else {
      notFoundRolls.push(roll);
      await deleteRosterRowsForRoll(db, roll);
    }
  }

  const attemptsDeleted = await deleteAttemptsForUserIds(db, userIdsToPurge);

  return { deletedRolls, notFoundRolls, errors, attemptsDeleted };
}

export type ElevateXSeedAccountResult = {
  roll: string;
  email: string;
  department: string;
  year: string;
  status: 'created' | 'updated';
  profileWarning?: string;
};

export type ElevateXSeedResult = {
  rdsProject: string;
  password: string;
  accounts: ElevateXSeedAccountResult[];
  scheduleId: string | null;
  scheduleWarning: string | null;
  scheduleLabel: string;
  legacyRemoved: string[];
  legacyRemoveErrors: string[];
};

/** Create/update ElevateX test students; remove legacy EX26001–15; go live Slot 1 window. */
export async function seedElevateXSample(
  db: DbServiceClient,
  rdsUrl: string,
  password: string = ELEVATEX_SAMPLE_PASSWORD,
  options?: { slotDateIso?: string },
): Promise<ElevateXSeedResult | { error: string; partial?: ElevateXSeedAccountResult[] }> {
  const project = (() => {
    try {
      return new URL(rdsUrl).hostname.split('.')[0] ?? rdsUrl;
    } catch {
      return rdsUrl;
    }
  })();

  const loaded = await loadAuthUsersByEmail(db);
  if ('error' in loaded) {
    return { error: loaded.error };
  }

  const { usersByEmail } = loaded;

  const { deleted: legacyRemoved, errors: legacyRemoveErrors } =
    await deleteLegacySampleStudents(usersByEmail, db);

  const seedResults = await mapConcurrent(ELEVATEX_SAMPLE_STUDENTS, 10, async (student) => {
    const email = studentAuthEmail(student.roll);
    const metadata = {
      role: 'student',
      full_name: student.fullName,
      roll_number: student.roll,
      roll: student.roll,
      department: student.department,
      branch: student.department,
      year: student.year,
      academic_year: student.year,
    };

    const outcome = await upsertAuthStudent(db, email, password, metadata, usersByEmail);
    if ('error' in outcome) {
      return { error: outcome.error, roll: student.roll } as const;
    }

    const profileWarning = await upsertStudentProfile(db, outcome.id, email, student);

    return {
      roll: student.roll,
      email,
      department: student.department,
      year: student.year,
      status: outcome.created ? ('created' as const) : ('updated' as const),
      ...(profileWarning ? { profileWarning } : {}),
    };
  });

  const failed = seedResults.find((r): r is { error: string; roll: string } => 'error' in r);
  if (failed) {
    const partial = seedResults.filter((r): r is ElevateXSeedAccountResult => !('error' in r));
    return { error: `${failed.roll}: ${failed.error}`, partial };
  }

  const accounts = seedResults as ElevateXSeedAccountResult[];

  const slotDate = options?.slotDateIso ?? todayIsoInIst();
  const { startsAt, endsAt, label: scheduleLabel } = getElevateXSlot1ScheduleWindow(slotDate);

  let scheduleId: string | null = null;
  let scheduleWarning: string | null = null;

  const { data: liveRows } = await db
    .from('evalora_module_schedules')
    .select('id')
    .eq('module_key', ELEVATEX_MODULE_KEY)
    .eq('status', 'live');

  if (liveRows?.length) {
    await db
      .from('evalora_module_schedules')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .in(
        'id',
        liveRows.map((r) => r.id),
      );
  }

  const rollRange = `${ELEVATEX_SAMPLE_STUDENTS[0]?.roll}–${ELEVATEX_SAMPLE_STUDENTS[ELEVATEX_SAMPLE_STUDENTS.length - 1]?.roll}`;

  const { data: schedule, error: schedErr } = await db
    .from('evalora_module_schedules')
    .insert({
      module_key: ELEVATEX_MODULE_KEY,
      title: `ElevateX — Slot ${ELEVATEX_SAMPLE_SLOT} test (${slotDate})`,
      notice: `Slot ${ELEVATEX_SAMPLE_SLOT} · 10:00 AM IST · ${rollRange} · 60 min paper.`,
      status: 'live',
      starts_at: startsAt,
      ends_at: endsAt,
      target_departments: [],
      target_years: ['III Year'],
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (schedErr) {
    scheduleWarning = schedErr.message;
  } else {
    scheduleId = schedule?.id ?? null;
  }

  return {
    rdsProject: project,
    password,
    accounts,
    scheduleId,
    scheduleWarning,
    scheduleLabel,
    legacyRemoved,
    legacyRemoveErrors,
  };
}
