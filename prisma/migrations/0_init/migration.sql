-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "roll_number" TEXT,
    "full_name" TEXT,
    "college" TEXT,
    "branch" TEXT,
    "academic_year" TEXT,
    "cgpa" DECIMAL(3,2),
    "phone" TEXT,
    "subscription_status" TEXT DEFAULT 'free',
    "subscription_end_date" TIMESTAMP(3),
    "resume_text" TEXT,
    "resume_file_name" TEXT,
    "resume_storage_path" TEXT,
    "resume_updated_at" TIMESTAMP(3),
    "user_role" TEXT DEFAULT 'student',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_users" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "permissions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "student_active_sessions" (
    "user_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_active_sessions_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tests" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "title" TEXT,
    "name" TEXT,
    "description" TEXT,
    "duration_minutes" INTEGER,
    "duration" INTEGER,
    "total_questions" INTEGER,
    "passing_score" INTEGER,
    "difficulty" TEXT,
    "difficulty_level" TEXT,
    "is_paid" BOOLEAN DEFAULT false,
    "question_time_limit_sec" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "questions" (
    "id" UUID NOT NULL,
    "test_id" UUID,
    "category_id" UUID,
    "question_text" TEXT NOT NULL,
    "question_type" TEXT DEFAULT 'MCQ',
    "type" TEXT DEFAULT 'MCQ',
    "difficulty" TEXT DEFAULT 'medium',
    "option_a" TEXT,
    "option_b" TEXT,
    "option_c" TEXT,
    "option_d" TEXT,
    "options" JSONB,
    "correct_answer" TEXT NOT NULL,
    "explanation" TEXT,
    "tags" JSONB DEFAULT '[]',
    "marks" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "question_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "question_tag_links" (
    "question_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "question_tag_links_pkey" PRIMARY KEY ("question_id","tag_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "test_id" UUID,
    "test_title" TEXT,
    "started_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "percentage_score" DECIMAL(5,2),
    "total_score" DECIMAL(10,2),
    "answers" JSONB,
    "time_taken" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "proctor_flags" INTEGER DEFAULT 0,
    "proctor_metadata" JSONB,
    "schedule_id" UUID,
    "slot_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_schedules" (
    "id" UUID NOT NULL,
    "test_id" TEXT,
    "title" TEXT,
    "description" TEXT,
    "notice" TEXT,
    "faculty_exam_request_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "target_departments" JSONB DEFAULT '[]',
    "target_years" JSONB DEFAULT '[]',
    "slot_number" INTEGER,
    "slot_capacity" INTEGER DEFAULT 130,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_violations" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "attempt_id" TEXT,
    "test_id" TEXT,
    "violation_type" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "student_dashboard_stats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stat_key" TEXT NOT NULL,
    "payload" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_dashboard_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "faculty_exam_requests" (
    "id" UUID NOT NULL,
    "faculty_user_id" UUID,
    "department" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "topic" TEXT,
    "target_years" JSONB DEFAULT '[]',
    "target_branches" JSONB DEFAULT '[]',
    "duration_minutes" INTEGER DEFAULT 30,
    "questions_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "published_test_id" TEXT,
    "test_type" TEXT,
    "slot_key" TEXT,
    "syllabus_topic_ids" JSONB DEFAULT '[]',
    "questions_per_topic" INTEGER,
    "uses_slot_scheduling" BOOLEAN NOT NULL DEFAULT false,
    "schedule_slots_json" JSONB DEFAULT '[]',
    "department_group_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faculty_exam_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_student_roster" (
    "id" UUID NOT NULL,
    "schedule_id" UUID,
    "roll_number" TEXT NOT NULL,
    "full_name" TEXT,
    "branch" TEXT,
    "year" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_student_roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_slot_roster_entries" (
    "id" UUID NOT NULL,
    "faculty_exam_request_id" UUID,
    "schedule_id" UUID,
    "slot_number" INTEGER,
    "roll_number" TEXT NOT NULL,
    "student_name" TEXT,
    "email" TEXT,
    "password" TEXT,
    "department" TEXT,
    "year" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_slot_roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "evalora_module_schedules" (
    "id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "title" TEXT,
    "notice" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "target_departments" JSONB DEFAULT '[]',
    "target_years" JSONB DEFAULT '[]',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evalora_module_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_builder_draws" (
    "id" UUID NOT NULL,
    "test_type" TEXT NOT NULL,
    "slot_key" TEXT NOT NULL,
    "topic_ids" JSONB DEFAULT '[]',
    "question_ids" JSONB DEFAULT '[]',
    "faculty_exam_request_id" UUID,
    "test_id" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_builder_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_questions" (
    "test_id" TEXT NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER DEFAULT 0,

    CONSTRAINT "test_questions_pkey" PRIMARY KEY ("test_id","question_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "test_sections" (
    "id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "cutoff_score" INTEGER,
    "negative_marking" DECIMAL(4,2) DEFAULT 0,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "department_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "department_group_members" (
    "group_id" UUID NOT NULL,
    "department" TEXT NOT NULL,

    CONSTRAINT "department_group_members_pkey" PRIMARY KEY ("group_id","department")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rmset_papers" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "test_id" UUID,
    "topic_ids" JSONB DEFAULT '[]',
    "questions_per_topic" INTEGER NOT NULL DEFAULT 10,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmset_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coding_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID,
    "language" TEXT NOT NULL,
    "source_code" TEXT NOT NULL,
    "stdin" TEXT,
    "stdout" TEXT,
    "stderr" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "runtime_ms" INTEGER,
    "memory_kb" INTEGER,
    "passed_public" INTEGER DEFAULT 0,
    "passed_hidden" INTEGER DEFAULT 0,
    "plagiarism_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coding_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "faculty_profiles" (
    "user_id" UUID NOT NULL,
    "employee_id" TEXT,
    "department" TEXT NOT NULL,
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faculty_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "blog_posts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "author" TEXT,
    "category" TEXT,
    "featured_image" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_roll_number_key" ON "users"("roll_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_roll_number_idx" ON "users"("roll_number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_user_id_key" ON "admin_users"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_users_user_id_idx" ON "admin_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "test_categories_slug_key" ON "test_categories"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tests_category_id_idx" ON "tests"("category_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_test_id_idx" ON "questions"("test_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_category_id_idx" ON "questions"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "question_tags_slug_key" ON "question_tags"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "question_tag_links_tag_id_idx" ON "question_tag_links"("tag_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "question_tag_links_question_id_idx" ON "question_tag_links"("question_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "test_attempts_user_id_status_idx" ON "test_attempts"("user_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "test_attempts_test_id_status_idx" ON "test_attempts"("test_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "test_attempts_user_id_test_id_idx" ON "test_attempts"("user_id", "test_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "test_attempts_completed_at_idx" ON "test_attempts"("completed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_schedules_status_starts_at_idx" ON "exam_schedules"("status", "starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_schedules_test_id_idx" ON "exam_schedules"("test_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_schedules_faculty_exam_request_id_idx" ON "exam_schedules"("faculty_exam_request_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_violations_attempt_id_idx" ON "exam_violations"("attempt_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_violations_user_id_idx" ON "exam_violations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "student_dashboard_stats_user_id_stat_key_key" ON "student_dashboard_stats"("user_id", "stat_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "faculty_exam_requests_status_idx" ON "faculty_exam_requests"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "faculty_exam_requests_faculty_user_id_idx" ON "faculty_exam_requests"("faculty_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "faculty_exam_requests_department_idx" ON "faculty_exam_requests"("department");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_student_roster_schedule_id_roll_number_idx" ON "exam_student_roster"("schedule_id", "roll_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_slot_roster_entries_faculty_exam_request_id_slot_numbe_idx" ON "exam_slot_roster_entries"("faculty_exam_request_id", "slot_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_slot_roster_entries_schedule_id_idx" ON "exam_slot_roster_entries"("schedule_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evalora_module_schedules_status_starts_at_idx" ON "evalora_module_schedules"("status", "starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evalora_module_schedules_module_key_idx" ON "evalora_module_schedules"("module_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_builder_draws_test_type_slot_key_idx" ON "exam_builder_draws"("test_type", "slot_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "test_questions_question_id_idx" ON "test_questions"("question_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "test_sections_test_id_sort_order_idx" ON "test_sections"("test_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "department_groups_name_key" ON "department_groups"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "department_group_members_department_idx" ON "department_group_members"("department");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "rmset_papers_status_idx" ON "rmset_papers"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coding_submissions_user_id_created_at_idx" ON "coding_submissions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "faculty_profiles_department_idx" ON "faculty_profiles"("department");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "blog_posts_published_at_idx" ON "blog_posts"("published_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_active_sessions" ADD CONSTRAINT "student_active_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "test_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tag_links" ADD CONSTRAINT "question_tag_links_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "question_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_dashboard_stats" ADD CONSTRAINT "student_dashboard_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_group_members" ADD CONSTRAINT "department_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "department_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
