import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  try {
    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl || postgresUrl.includes('YOUR_')) {
      return NextResponse.json({ error: 'POSTGRES_URL not configured' }, { status: 400 });
    }

    // Create postgres client
    const sql = postgres(postgresUrl, {
      max: 1,
      onnotice: () => {},
    });

    console.log('Starting database initialization...');

    // Drop old tables if they exist (for fresh start)
    await sql`DROP TABLE IF EXISTS question_answers CASCADE;`;
    await sql`DROP TABLE IF EXISTS test_attempts CASCADE;`;
    await sql`DROP TABLE IF EXISTS questions CASCADE;`;
    await sql`DROP TABLE IF EXISTS tests CASCADE;`;
    await sql`DROP TABLE IF EXISTS test_categories CASCADE;`;
    await sql`DROP TABLE IF EXISTS payments CASCADE;`;
    await sql`DROP TABLE IF EXISTS blog_posts CASCADE;`;
    await sql`DROP TABLE IF EXISTS users CASCADE;`;

    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT DEFAULT 'User',
        college TEXT,
        branch TEXT,
        cgpa DECIMAL(3,2),
        phone TEXT,
        subscription_status TEXT DEFAULT 'free',
        subscription_end_date TIMESTAMP,
        resume_text TEXT,
        resume_file_name TEXT,
        resume_storage_path TEXT,
        resume_updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create test categories table
    await sql`
      CREATE TABLE IF NOT EXISTS test_categories (
        id BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📊',
        test_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create tests table
    await sql`
      CREATE TABLE IF NOT EXISTS tests (
        id BIGSERIAL PRIMARY KEY,
        category_id BIGINT NOT NULL REFERENCES test_categories(id),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        duration_minutes INT NOT NULL DEFAULT 60,
        total_questions INT NOT NULL DEFAULT 50,
        difficulty TEXT DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create questions table
    await sql`
      CREATE TABLE IF NOT EXISTS questions (
        id BIGSERIAL PRIMARY KEY,
        test_id BIGINT NOT NULL REFERENCES tests(id),
        question_text TEXT NOT NULL,
        question_type TEXT DEFAULT 'mcq',
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer TEXT NOT NULL,
        explanation TEXT DEFAULT '',
        marks INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create test attempts table
    await sql`
      CREATE TABLE IF NOT EXISTS test_attempts (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        test_id BIGINT NOT NULL REFERENCES tests(id),
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        total_score INT DEFAULT 0,
        percentage_score DECIMAL(5,2) DEFAULT 0,
        status TEXT DEFAULT 'in_progress',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create question answers table
    await sql`
      CREATE TABLE IF NOT EXISTS question_answers (
        id BIGSERIAL PRIMARY KEY,
        attempt_id BIGINT NOT NULL REFERENCES test_attempts(id),
        question_id BIGINT NOT NULL REFERENCES questions(id),
        user_answer TEXT,
        is_correct BOOLEAN,
        time_spent_seconds INT DEFAULT 0,
        marked_for_review BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create blog posts table
    await sql`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id BIGSERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT DEFAULT '',
        content TEXT DEFAULT '',
        author TEXT DEFAULT 'PrepIndia',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create payments table
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        amount INT NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'pending',
        plan_type TEXT DEFAULT 'premium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Join table used by `/tests/take/[id]` (many-to-many ordering)
    await sql`
      CREATE TABLE IF NOT EXISTS test_questions (
        id BIGSERIAL PRIMARY KEY,
        test_id BIGINT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        "order" INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(test_id, question_id)
      );
    `;

    // Admin whitelist (referenced by /admin)
    await sql`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'admin',
        permissions JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tests_category ON tests(category_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_questions_test ON test_questions(test_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attempts_user ON test_attempts(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attempts_test ON test_attempts(test_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_answers_attempt ON question_answers(attempt_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);`;

    // RLS: anon clients read catalog/questions; authenticated users manage own profile & attempts.
    await sql.unsafe(`
      ALTER TABLE test_categories ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_public_read_categories" ON test_categories;
      CREATE POLICY "prep_public_read_categories" ON test_categories FOR SELECT USING (true);

      ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_public_read_tests" ON tests;
      CREATE POLICY "prep_public_read_tests" ON tests FOR SELECT USING (true);

      ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_public_read_questions" ON questions;
      CREATE POLICY "prep_public_read_questions" ON questions FOR SELECT USING (true);

      ALTER TABLE test_questions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_public_read_test_questions" ON test_questions;
      CREATE POLICY "prep_public_read_test_questions" ON test_questions FOR SELECT USING (true);

      ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_public_read_blog" ON blog_posts;
      CREATE POLICY "prep_public_read_blog" ON blog_posts FOR SELECT USING (true);

      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_users_select_own" ON users;
      CREATE POLICY "prep_users_select_own" ON users FOR SELECT USING (auth.uid() = id);
      DROP POLICY IF EXISTS "prep_users_insert_own" ON users;
      CREATE POLICY "prep_users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);
      DROP POLICY IF EXISTS "prep_users_update_own" ON users;
      CREATE POLICY "prep_users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

      ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_attempts_select_own" ON test_attempts;
      CREATE POLICY "prep_attempts_select_own" ON test_attempts FOR SELECT USING (auth.uid() = user_id);
      DROP POLICY IF EXISTS "prep_attempts_insert_own" ON test_attempts;
      CREATE POLICY "prep_attempts_insert_own" ON test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
      DROP POLICY IF EXISTS "prep_attempts_update_own" ON test_attempts;
      CREATE POLICY "prep_attempts_update_own" ON test_attempts FOR UPDATE USING (auth.uid() = user_id);

      ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_payments_select_own" ON payments;
      CREATE POLICY "prep_payments_select_own" ON payments FOR SELECT USING (auth.uid() = user_id);
      DROP POLICY IF EXISTS "prep_payments_insert_own" ON payments;
      CREATE POLICY "prep_payments_insert_own" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);

      ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prep_admin_users_select_own" ON admin_users;
      CREATE POLICY "prep_admin_users_select_own" ON admin_users FOR SELECT USING (auth.uid() = user_id);
    `);

    console.log('Database tables created successfully');

    // Close connection
    await sql.end();

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully'
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Database initialization failed',
        details: String(error)
      },
      { status: 500 }
    );
  }
}
