-- Link Exam Builder Pro exams to legacy publish pipeline
ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "faculty_exam_request_id" UUID,
  ADD COLUMN IF NOT EXISTS "published_test_id" TEXT;
