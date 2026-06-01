import type { DbServiceClient } from '@/lib/db/get-db-service';
import { COLLEGE } from '@/lib/college-brand';
import { studentAuthEmail } from '@/lib/college-auth';
import { normalizeRoll, type ExamScheduleSlotInput } from '@/lib/exam-schedule-slots';
import { isValidAcademicYear } from '@/lib/roles';

export type RosterProvisionResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type RosterStudent = {
  roll_number: string;
  student_name?: string;
  email?: string;
  branch?: string;
  academic_year?: string;
  password?: string;
};

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!);
    }
  }

  const workers = Math.min(Math.max(concurrency, 1), items.length === 0 ? 1 : items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function loadAuthUsersByEmail(
  db: DbServiceClient,
): Promise<Map<string, { id: string }>> {
  const usersByEmail = new Map<string, { id: string }>();
  let page = 1;
  while (page <= 50) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), { id: user.id });
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return usersByEmail;
}

function collectUniqueRosterStudents(slots: ExamScheduleSlotInput[]): RosterStudent[] {
  const byRoll = new Map<string, RosterStudent>();
  for (const slot of slots) {
    for (const student of slot.roster) {
      const roll = normalizeRoll(student.roll_number);
      if (!roll) continue;
      const existing = byRoll.get(roll);
      byRoll.set(roll, {
        roll_number: roll,
        student_name: student.student_name ?? existing?.student_name,
        email: student.email ?? existing?.email,
        branch: student.branch ?? existing?.branch,
        academic_year: student.academic_year ?? existing?.academic_year,
        password: student.password ?? existing?.password,
      });
    }
  }
  return Array.from(byRoll.values());
}

export async function provisionStudentsFromSlotRoster(
  admin: DbServiceClient,
  input: {
    slots: ExamScheduleSlotInput[];
    defaultDepartment: string;
    defaultYears: string[];
    defaultPassword?: string;
  },
): Promise<RosterProvisionResult> {
  const students = collectUniqueRosterStudents(input.slots);
  if (students.length === 0) {
    return { created: 0, updated: 0, skipped: 0, errors: [] };
  }

  const defaultPassword =
    input.defaultPassword?.trim() ||
    process.env.EXAM_STUDENT_DEFAULT_PASSWORD?.trim() ||
    'Exam2026';
  const defaultYear =
    input.defaultYears.find((y) => isValidAcademicYear(y)) ?? 'III Year';

  const usersByEmail = await loadAuthUsersByEmail(admin);
  const result: RosterProvisionResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  await mapConcurrent(students, 8, async (student) => {
    const roll = student.roll_number;
    /** Login always uses roll → studentAuthEmail(roll); CSV "email" is contact only. */
    const authEmail = studentAuthEmail(roll).toLowerCase();
    const contactEmail = student.email?.trim().toLowerCase();
    const branch = (student.branch?.trim() || input.defaultDepartment).trim();
    const yearRaw = student.academic_year?.trim() || defaultYear;
    const academicYear = isValidAcademicYear(yearRaw) ? yearRaw : defaultYear;
    const password = student.password?.trim() || defaultPassword;
    const fullName = student.student_name?.trim() || roll;

    const metadata: Record<string, unknown> = {
      role: 'student',
      roll_number: roll,
      department: branch,
      branch,
      year: academicYear,
      prep_profile: {
        full_name: fullName,
        branch,
        academic_year: academicYear,
        roll_number: roll,
      },
    };
    if (contactEmail && contactEmail !== authEmail) {
      metadata.contact_email = contactEmail;
    }

    let existing = usersByEmail.get(authEmail);
    if (!existing?.id && contactEmail && contactEmail !== authEmail) {
      const legacy = usersByEmail.get(contactEmail);
      if (legacy?.id) {
        const { error: migrateErr } = await admin.auth.admin.updateUserById(legacy.id, {
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: metadata,
        });
        if (!migrateErr) {
          usersByEmail.delete(contactEmail);
          usersByEmail.set(authEmail, { id: legacy.id });
          existing = legacy;
        }
      }
    }

    let userId: string;

    if (existing?.id) {
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (updateError) {
        result.errors.push(`${roll}: ${updateError.message}`);
        result.skipped += 1;
        return;
      }
      userId = existing.id;
      result.updated += 1;
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (createError || !created.user?.id) {
        result.errors.push(`${roll}: ${createError?.message ?? 'create failed'}`);
        result.skipped += 1;
        return;
      }
      userId = created.user.id;
      usersByEmail.set(authEmail, { id: userId });
      result.created += 1;
    }

    const { error: profileError } = await admin.from('users').upsert(
      {
        id: userId,
        email: authEmail,
        full_name: fullName,
        branch,
        academic_year: academicYear,
        user_role: 'student',
        college: COLLEGE.shortName,
        subscription_status: 'free',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      result.errors.push(`${roll}: profile ${profileError.message}`);
    }
  });

  return result;
}

/** Fail publish when no roster logins could be created (surfaces misconfig to admin). */
export function assertRosterProvisionSucceeded(
  result: RosterProvisionResult,
  studentCount: number,
): void {
  if (studentCount === 0) return;
  if (result.created + result.updated > 0) return;
  const detail = result.errors.slice(0, 5).join(' ');
  throw new Error(
    detail
      ? `Could not create student login accounts: ${detail}`
      : 'Could not create student login accounts. Check DATABASE_URL and admin credentials key and Auth settings.',
  );
}
