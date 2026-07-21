-- Raise the supported per-slot roster capacity from 130 to 150.
ALTER TABLE "exam_schedules"
  ALTER COLUMN "slot_capacity" SET DEFAULT 150;

-- Existing schedules that still use the previous default should accept 150.
UPDATE "exam_schedules"
SET "slot_capacity" = 150
WHERE "slot_capacity" = 130;
