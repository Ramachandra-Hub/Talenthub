-- DSA Arena coding contests + contest-bank problem metadata
-- Makes week_attempt_id nullable so contest submissions can omit day attempts.

ALTER TABLE "dsa_problems"
  ADD COLUMN IF NOT EXISTS "student_explanation" TEXT,
  ADD COLUMN IF NOT EXISTS "source_bank_key" TEXT,
  ADD COLUMN IF NOT EXISTS "category_label" TEXT,
  ADD COLUMN IF NOT EXISTS "tags_json" JSONB,
  ADD COLUMN IF NOT EXISTS "reference_solutions_json" JSONB,
  ADD COLUMN IF NOT EXISTS "reference_solution_status" TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS "time_limit_ms" INTEGER,
  ADD COLUMN IF NOT EXISTS "memory_limit_kb" INTEGER,
  ADD COLUMN IF NOT EXISTS "contest_bank" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "dsa_problems_source_bank_key_key" ON "dsa_problems"("source_bank_key");
CREATE INDEX IF NOT EXISTS "dsa_problems_contest_bank_is_active_idx" ON "dsa_problems"("contest_bank", "is_active");

ALTER TABLE "dsa_code_submissions"
  ALTER COLUMN "week_attempt_id" DROP NOT NULL;

ALTER TABLE "dsa_code_submissions"
  ADD COLUMN IF NOT EXISTS "contest_id" UUID,
  ADD COLUMN IF NOT EXISTS "contest_attempt_id" UUID,
  ADD COLUMN IF NOT EXISTS "compile_ok" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "failure_type" TEXT,
  ADD COLUMN IF NOT EXISTS "public_passed" INTEGER,
  ADD COLUMN IF NOT EXISTS "public_total" INTEGER,
  ADD COLUMN IF NOT EXISTS "hidden_passed" INTEGER,
  ADD COLUMN IF NOT EXISTS "hidden_total" INTEGER;

CREATE TABLE IF NOT EXISTS "dsa_coding_contests" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "instructions" TEXT,
  "difficulty" TEXT NOT NULL DEFAULT 'mixed',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "duration_minutes" INTEGER NOT NULL DEFAULT 90,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dsa_coding_contests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dsa_coding_contests_slug_key" ON "dsa_coding_contests"("slug");
CREATE INDEX IF NOT EXISTS "dsa_coding_contests_status_is_published_is_active_idx"
  ON "dsa_coding_contests"("status", "is_published", "is_active");

CREATE TABLE IF NOT EXISTS "dsa_coding_contest_problems" (
  "id" UUID NOT NULL,
  "contest_id" UUID NOT NULL,
  "problem_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dsa_coding_contest_problems_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dsa_coding_contest_problems_contest_id_problem_id_key"
  ON "dsa_coding_contest_problems"("contest_id", "problem_id");
CREATE UNIQUE INDEX IF NOT EXISTS "dsa_coding_contest_problems_contest_id_position_key"
  ON "dsa_coding_contest_problems"("contest_id", "position");
CREATE INDEX IF NOT EXISTS "dsa_coding_contest_problems_problem_id_idx"
  ON "dsa_coding_contest_problems"("problem_id");

CREATE TABLE IF NOT EXISTS "dsa_coding_contest_attempts" (
  "id" UUID NOT NULL,
  "contest_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "total_score" INTEGER NOT NULL DEFAULT 0,
  "max_score" INTEGER NOT NULL DEFAULT 300,
  "solved_count" INTEGER NOT NULL DEFAULT 0,
  "attempted_count" INTEGER NOT NULL DEFAULT 0,
  "duration_seconds" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dsa_coding_contest_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dsa_coding_contest_attempts_contest_id_user_id_key"
  ON "dsa_coding_contest_attempts"("contest_id", "user_id");
CREATE INDEX IF NOT EXISTS "dsa_coding_contest_attempts_user_id_status_idx"
  ON "dsa_coding_contest_attempts"("user_id", "status");
CREATE INDEX IF NOT EXISTS "dsa_coding_contest_attempts_contest_id_status_idx"
  ON "dsa_coding_contest_attempts"("contest_id", "status");

DO $$ BEGIN
  ALTER TABLE "dsa_coding_contest_problems"
    ADD CONSTRAINT "dsa_coding_contest_problems_contest_id_fkey"
    FOREIGN KEY ("contest_id") REFERENCES "dsa_coding_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dsa_coding_contest_problems"
    ADD CONSTRAINT "dsa_coding_contest_problems_problem_id_fkey"
    FOREIGN KEY ("problem_id") REFERENCES "dsa_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dsa_coding_contest_attempts"
    ADD CONSTRAINT "dsa_coding_contest_attempts_contest_id_fkey"
    FOREIGN KEY ("contest_id") REFERENCES "dsa_coding_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dsa_coding_contest_attempts"
    ADD CONSTRAINT "dsa_coding_contest_attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dsa_code_submissions"
    ADD CONSTRAINT "dsa_code_submissions_contest_id_fkey"
    FOREIGN KEY ("contest_id") REFERENCES "dsa_coding_contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dsa_code_submissions"
    ADD CONSTRAINT "dsa_code_submissions_contest_attempt_id_fkey"
    FOREIGN KEY ("contest_attempt_id") REFERENCES "dsa_coding_contest_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "dsa_code_submissions_contest_attempt_id_problem_id_created_at_idx"
  ON "dsa_code_submissions"("contest_attempt_id", "problem_id", "created_at");
CREATE INDEX IF NOT EXISTS "dsa_code_submissions_contest_id_created_at_idx"
  ON "dsa_code_submissions"("contest_id", "created_at");
