-- Exam Builder module: exams, subjects, and exam_subjects

CREATE TABLE IF NOT EXISTS "exams" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "duration" INTEGER NOT NULL DEFAULT 60,
  "total_marks" INTEGER NOT NULL,
  "passing_marks" INTEGER NOT NULL,
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "exams_status_start_time_idx" ON "exams" ("status", "start_time");
CREATE INDEX IF NOT EXISTS "exams_created_by_idx" ON "exams" ("created_by");

DO $$
BEGIN
  ALTER TABLE "exams"
    ADD CONSTRAINT "exams_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "subjects" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "subject_name" TEXT NOT NULL UNIQUE,
  "slug" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "subjects_status_idx" ON "subjects" ("status");

CREATE TABLE IF NOT EXISTS "exam_subjects" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "exam_id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_subjects_exam_id_subject_id_key" ON "exam_subjects" ("exam_id", "subject_id");
CREATE INDEX IF NOT EXISTS "exam_subjects_exam_id_idx" ON "exam_subjects" ("exam_id");
CREATE INDEX IF NOT EXISTS "exam_subjects_subject_id_idx" ON "exam_subjects" ("subject_id");

DO $$
BEGIN
  ALTER TABLE "exam_subjects"
    ADD CONSTRAINT "exam_subjects_exam_id_fkey"
    FOREIGN KEY ("exam_id") REFERENCES "exams"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "exam_subjects"
    ADD CONSTRAINT "exam_subjects_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
