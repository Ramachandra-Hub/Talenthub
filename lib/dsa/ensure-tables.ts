import { prisma } from '@/lib/prisma';

let tablesReady = false;

async function dsaProgramsTableExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean | string | number }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'dsa_programs'
    ) AS exists
  `;
  const value = rows[0]?.exists;
  return value === true || value === 't' || value === 1 || value === 'true';
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "dsa_programs" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "days_per_week" INTEGER NOT NULL DEFAULT 5,
    "config_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_programs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_programs_slug_key" ON "dsa_programs"("slug")`,
  `CREATE TABLE IF NOT EXISTS "dsa_levels" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_levels_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_levels_program_id_slug_key" ON "dsa_levels"("program_id", "slug")`,
  `CREATE TABLE IF NOT EXISTS "dsa_weeks" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "topic_slug" TEXT NOT NULL,
    "topic_name" TEXT NOT NULL,
    "is_revision" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_weeks_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_weeks_level_id_week_number_key" ON "dsa_weeks"("level_id", "week_number")`,
  `CREATE TABLE IF NOT EXISTS "dsa_days" (
    "id" UUID NOT NULL,
    "week_id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_days_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_days_week_id_day_number_key" ON "dsa_days"("week_id", "day_number")`,
  `CREATE TABLE IF NOT EXISTS "dsa_topics" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_slug" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_topics_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_topics_slug_key" ON "dsa_topics"("slug")`,
  `CREATE TABLE IF NOT EXISTS "dsa_problems" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "constraints" TEXT,
    "input_format" TEXT NOT NULL,
    "output_format" TEXT NOT NULL,
    "examples_json" JSONB NOT NULL,
    "topic_id" UUID NOT NULL,
    "concept_slug" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "expected_complexity" TEXT,
    "hints_json" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT,
    "starter_code_json" JSONB NOT NULL,
    "test_cases_json" JSONB NOT NULL,
    "languages_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_problems_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_problems_slug_key" ON "dsa_problems"("slug")`,
  `CREATE TABLE IF NOT EXISTS "dsa_mcqs" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "topic_id" UUID NOT NULL,
    "concept_slug" TEXT NOT NULL,
    "problem_slug" TEXT,
    "question_text" TEXT NOT NULL,
    "option_a" TEXT NOT NULL,
    "option_b" TEXT NOT NULL,
    "option_c" TEXT NOT NULL,
    "option_d" TEXT NOT NULL,
    "correct_answer" TEXT NOT NULL,
    "explanation" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_mcqs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_mcqs_slug_key" ON "dsa_mcqs"("slug")`,
  `CREATE TABLE IF NOT EXISTS "dsa_enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_enrollments_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_enrollments_user_id_program_id_key" ON "dsa_enrollments"("user_id", "program_id")`,
  `CREATE TABLE IF NOT EXISTS "dsa_week_attempts" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "week_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'official',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "assessment_percent" DECIMAL(5,2),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "dsa_week_attempts_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_week_attempts_enrollment_id_week_id_attempt_number_kind_key"
    ON "dsa_week_attempts"("enrollment_id", "week_id", "attempt_number", "kind")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_week_attempts_one_active_official"
    ON "dsa_week_attempts"("enrollment_id", "week_id")
    WHERE "is_active" = true AND "kind" = 'official'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_week_attempts_one_active_practice"
    ON "dsa_week_attempts"("enrollment_id", "week_id")
    WHERE "is_active" = true AND "kind" = 'practice'`,
  `CREATE TABLE IF NOT EXISTS "dsa_day_progress" (
    "id" UUID NOT NULL,
    "week_attempt_id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'locked',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "mcq_percent" DECIMAL(5,2),
    "coding_solved" INTEGER NOT NULL DEFAULT 0,
    "fail_reason" TEXT,
    CONSTRAINT "dsa_day_progress_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_day_progress_week_attempt_id_day_id_key" ON "dsa_day_progress"("week_attempt_id", "day_id")`,
  `CREATE TABLE IF NOT EXISTS "dsa_day_assignments" (
    "id" UUID NOT NULL,
    "day_progress_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "problem_id" UUID,
    "mcq_id" UUID,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_day_assignments_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "dsa_code_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_attempt_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "source_code" TEXT NOT NULL,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "score_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "stdout" TEXT,
    "stderr" TEXT,
    "runtime_ms" INTEGER,
    "memory_kb" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'official',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_code_submissions_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "dsa_mcq_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_attempt_id" UUID NOT NULL,
    "mcq_id" UUID NOT NULL,
    "selected" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'official',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_mcq_attempts_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "dsa_qualifications" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "week_attempt_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'weekly_dsa_completion',
    "status" TEXT NOT NULL DEFAULT 'qualified',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_qualifications_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_qualifications_enrollment_id_week_attempt_id_key"
    ON "dsa_qualifications"("enrollment_id", "week_attempt_id")`,
  `CREATE TABLE IF NOT EXISTS "dsa_audit_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dsa_audit_events_pkey" PRIMARY KEY ("id")
  )`,
];

async function addFk(sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch {
    /* already exists or parent table not ready */
  }
}

/** Creates DSA tables if this database was deployed before the portal existed. */
export async function ensureDsaTables(): Promise<void> {
  if (tablesReady) return;
  if (await dsaProgramsTableExists()) {
    tablesReady = true;
    return;
  }

  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }

  await addFk(
    `ALTER TABLE "dsa_levels" ADD CONSTRAINT "dsa_levels_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "dsa_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_weeks" ADD CONSTRAINT "dsa_weeks_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "dsa_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_days" ADD CONSTRAINT "dsa_days_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "dsa_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_problems" ADD CONSTRAINT "dsa_problems_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "dsa_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_mcqs" ADD CONSTRAINT "dsa_mcqs_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "dsa_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_enrollments" ADD CONSTRAINT "dsa_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_enrollments" ADD CONSTRAINT "dsa_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "dsa_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_week_attempts" ADD CONSTRAINT "dsa_week_attempts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "dsa_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_week_attempts" ADD CONSTRAINT "dsa_week_attempts_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "dsa_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_day_progress" ADD CONSTRAINT "dsa_day_progress_week_attempt_id_fkey" FOREIGN KEY ("week_attempt_id") REFERENCES "dsa_week_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_day_progress" ADD CONSTRAINT "dsa_day_progress_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "dsa_days"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_day_assignments" ADD CONSTRAINT "dsa_day_assignments_day_progress_id_fkey" FOREIGN KEY ("day_progress_id") REFERENCES "dsa_day_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_code_submissions" ADD CONSTRAINT "dsa_code_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_code_submissions" ADD CONSTRAINT "dsa_code_submissions_week_attempt_id_fkey" FOREIGN KEY ("week_attempt_id") REFERENCES "dsa_week_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_code_submissions" ADD CONSTRAINT "dsa_code_submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "dsa_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_mcq_attempts" ADD CONSTRAINT "dsa_mcq_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_mcq_attempts" ADD CONSTRAINT "dsa_mcq_attempts_mcq_id_fkey" FOREIGN KEY ("mcq_id") REFERENCES "dsa_mcqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_qualifications" ADD CONSTRAINT "dsa_qualifications_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "dsa_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_qualifications" ADD CONSTRAINT "dsa_qualifications_week_attempt_id_fkey" FOREIGN KEY ("week_attempt_id") REFERENCES "dsa_week_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await addFk(
    `ALTER TABLE "dsa_audit_events" ADD CONSTRAINT "dsa_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  );

  tablesReady = true;
}

export function isMissingDsaTableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /dsa_/i.test(message) &&
    (/does not exist/i.test(message) ||
      /P2021/.test(message) ||
      /relation .* does not exist/i.test(message))
  );
}
