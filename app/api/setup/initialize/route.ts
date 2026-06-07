import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';
import { useAwsStack } from '@/lib/aws/stack';

const isDatabaseConfigured =
  !!process.env.DATABASE_URL?.trim() &&
  !!process.env.AUTH_SECRET?.trim() &&
  !process.env.DATABASE_URL.includes('YOUR_') &&
  !process.env.AUTH_SECRET.includes('YOUR_');

export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  if (useAwsStack()) {
    return NextResponse.json(
      {
        error:
          'Legacy Supabase initialize is disabled on AWS RDS. Use POST /api/setup/rds and prisma migrate deploy.',
      },
      { status: 410 },
    );
  }

  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json(
        { error: 'Set DATABASE_URL and AUTH_SECRET in .env.local' },
        { status: 500 }
      );
    }

    const db = getDbService();

    const sqlStatements = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY REFERENCES auth.users(id),
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        college TEXT,
        branch TEXT,
        cgpa DECIMAL(3,2),
        phone TEXT,
        subscription_status TEXT DEFAULT 'free',
        subscription_end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Test categories table
      `CREATE TABLE IF NOT EXISTS test_categories (
        id BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        icon TEXT,
        test_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Tests table
      `CREATE TABLE IF NOT EXISTS tests (
        id BIGSERIAL PRIMARY KEY,
        category_id BIGINT NOT NULL REFERENCES test_categories(id),
        title TEXT NOT NULL,
        description TEXT,
        duration_minutes INT NOT NULL,
        total_questions INT NOT NULL,
        difficulty TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Questions table
      `CREATE TABLE IF NOT EXISTS questions (
        id BIGSERIAL PRIMARY KEY,
        test_id BIGINT NOT NULL REFERENCES tests(id),
        question_text TEXT NOT NULL,
        question_type TEXT DEFAULT 'mcq',
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer TEXT NOT NULL,
        explanation TEXT,
        marks INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Test attempts table
      `CREATE TABLE IF NOT EXISTS test_attempts (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        test_id BIGINT NOT NULL REFERENCES tests(id),
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        total_score INT,
        percentage_score DECIMAL(5,2),
        status TEXT DEFAULT 'in_progress',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Question answers table
      `CREATE TABLE IF NOT EXISTS question_answers (
        id BIGSERIAL PRIMARY KEY,
        attempt_id BIGINT NOT NULL REFERENCES test_attempts(id),
        question_id BIGINT NOT NULL REFERENCES questions(id),
        user_answer TEXT,
        is_correct BOOLEAN,
        time_spent_seconds INT,
        marked_for_review BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Blog posts table
      `CREATE TABLE IF NOT EXISTS blog_posts (
        id BIGSERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT,
        author TEXT,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Payments table
      `CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        amount INT NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'pending',
        plan_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
      `CREATE INDEX IF NOT EXISTS idx_tests_category ON tests(category_id);`,
      `CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);`,
      `CREATE INDEX IF NOT EXISTS idx_attempts_user ON test_attempts(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_attempts_test ON test_attempts(test_id);`,
      `CREATE INDEX IF NOT EXISTS idx_answers_attempt ON question_answers(attempt_id);`,
      `CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);`,
    ];

    // Execute all SQL statements at once using the admin client
    let dbInitialized = false;
    const results = [];

    for (const sql of sqlStatements) {
      try {
        const { data, error } = await db.rpc('exec_sql', { sql });
        if (!error) {
          dbInitialized = true;
          results.push({ success: true, sql: sql.substring(0, 40) });
        } else {
          results.push({ success: false, error: error.message });
        }
      } catch (err) {
        // RPC might not exist, which is ok - tables might already exist
        results.push({ success: false, error: String(err) });
      }
    }

    // Check if users table exists, if so, database is initialized
    const { data: usersCheck } = await db
      .from('users')
      .select('count', { count: 'exact', head: true });

    const isInitialized = usersCheck !== null || dbInitialized;

    return NextResponse.json({
      success: isInitialized,
      message: isInitialized ? 'Database initialized successfully' : 'Database initialization attempted',
      tablesCreated: dbInitialized,
      initialized: isInitialized
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Setup failed',
        stack: error instanceof Error ? error.stack : ''
      },
      { status: 500 }
    );
  }
}
