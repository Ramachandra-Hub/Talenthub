-- Add assessment format for programming subjects on exam_subjects
ALTER TABLE "exam_subjects"
  ADD COLUMN IF NOT EXISTS "assessment_format" TEXT NOT NULL DEFAULT 'mcq';
