-- Open exam join link + registration log for Excel export
ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "open_link_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "open_link_token" TEXT,
  ADD COLUMN IF NOT EXISTS "open_link_password" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "exams_open_link_token_key"
  ON "exams" ("open_link_token");

CREATE TABLE IF NOT EXISTS "exam_open_link_entries" (
  "id" UUID NOT NULL,
  "exam_id" UUID NOT NULL,
  "roll_number" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "year" TEXT NOT NULL,
  "user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exam_open_link_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_open_link_entries_exam_id_roll_number_key"
  ON "exam_open_link_entries" ("exam_id", "roll_number");

CREATE INDEX IF NOT EXISTS "exam_open_link_entries_exam_id_idx"
  ON "exam_open_link_entries" ("exam_id");

DO $$
BEGIN
  ALTER TABLE "exam_open_link_entries"
    ADD CONSTRAINT "exam_open_link_entries_exam_id_fkey"
    FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
