-- Slot + attempt round: one completed attempt per schedule sitting.
ALTER TABLE "exam_schedules" ADD COLUMN IF NOT EXISTS "attempt_round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "test_attempts" ADD COLUMN IF NOT EXISTS "attempt_round" INTEGER DEFAULT 1;

DROP INDEX IF EXISTS "test_attempts_one_completed_per_user_test_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "test_attempts_one_completed_per_schedule_idx"
  ON "test_attempts" ("user_id", "schedule_id")
  WHERE "schedule_id" IS NOT NULL
    AND "status" IN ('completed', 'submitted');
CREATE UNIQUE INDEX IF NOT EXISTS "test_attempts_one_completed_per_user_test_idx"
  ON "test_attempts" ("user_id", "test_id")
  WHERE "schedule_id" IS NULL
    AND "test_id" IS NOT NULL
    AND "status" IN ('completed', 'submitted');

CREATE INDEX IF NOT EXISTS "exam_schedules_faculty_slot_round_idx"
  ON "exam_schedules" ("faculty_exam_request_id", "slot_number", "attempt_round");
