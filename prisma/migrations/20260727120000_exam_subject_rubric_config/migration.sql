-- Exam Builder Pro: strict rubric matrix per subject (topicSlug → mcq/coding counts)
ALTER TABLE "exam_subjects" ADD COLUMN IF NOT EXISTS "rubric_config" JSONB;
