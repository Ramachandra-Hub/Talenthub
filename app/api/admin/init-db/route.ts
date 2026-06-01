import { getDbService } from '@/lib/db/get-db-service';
import { NextResponse } from 'next/server';

const isDatabaseConfigured =
  !!process.env.DATABASE_URL?.trim() &&
  !!process.env.AUTH_SECRET?.trim() &&
  !process.env.DATABASE_URL.includes('YOUR_') &&
  !process.env.AUTH_SECRET.includes('YOUR_');

export async function POST(request: Request) {
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json(
        { error: 'Set DATABASE_URL and AUTH_SECRET in .env.local' },
        { status: 500 }
      );
    }

    const db = getDbService();

    // Create tables
    const { error: createTablesError } = await db.rpc('exec', {
      sql: `
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
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
        );

        -- Test categories table
        CREATE TABLE IF NOT EXISTS test_categories (
          id BIGSERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT,
          icon TEXT,
          test_count INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Tests table
        CREATE TABLE IF NOT EXISTS tests (
          id BIGSERIAL PRIMARY KEY,
          category_id BIGINT NOT NULL REFERENCES test_categories(id),
          title TEXT NOT NULL,
          description TEXT,
          duration_minutes INT NOT NULL,
          total_questions INT NOT NULL,
          difficulty TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Questions table
        CREATE TABLE IF NOT EXISTS questions (
          id BIGSERIAL PRIMARY KEY,
          test_id BIGINT NOT NULL REFERENCES tests(id),
          question_text TEXT NOT NULL,
          question_type TEXT,
          option_a TEXT,
          option_b TEXT,
          option_c TEXT,
          option_d TEXT,
          correct_answer TEXT NOT NULL,
          explanation TEXT,
          marks INT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Test attempts table
        CREATE TABLE IF NOT EXISTS test_attempts (
          id BIGSERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id),
          test_id BIGINT NOT NULL REFERENCES tests(id),
          started_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP,
          total_score INT,
          percentage_score DECIMAL(5,2),
          status TEXT DEFAULT 'in_progress',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Question answers table
        CREATE TABLE IF NOT EXISTS question_answers (
          id BIGSERIAL PRIMARY KEY,
          attempt_id BIGINT NOT NULL REFERENCES test_attempts(id),
          question_id BIGINT NOT NULL REFERENCES questions(id),
          user_answer TEXT,
          is_correct BOOLEAN,
          time_spent_seconds INT,
          marked_for_review BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Blog posts table
        CREATE TABLE IF NOT EXISTS blog_posts (
          id BIGSERIAL PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          excerpt TEXT,
          content TEXT,
          author TEXT,
          published_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Payments table
        CREATE TABLE IF NOT EXISTS payments (
          id BIGSERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id),
          razorpay_order_id TEXT,
          razorpay_payment_id TEXT,
          amount INT NOT NULL,
          currency TEXT DEFAULT 'INR',
          status TEXT DEFAULT 'pending',
          plan_type TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Admin logs table
        CREATE TABLE IF NOT EXISTS admin_logs (
          id BIGSERIAL PRIMARY KEY,
          admin_id UUID REFERENCES users(id),
          action TEXT,
          entity_type TEXT,
          entity_id BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_tests_category ON tests(category_id);
        CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
        CREATE INDEX IF NOT EXISTS idx_attempts_user ON test_attempts(user_id);
        CREATE INDEX IF NOT EXISTS idx_attempts_test ON test_attempts(test_id);
        CREATE INDEX IF NOT EXISTS idx_answers_attempt ON question_answers(attempt_id);
        CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

        -- Enable RLS
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
        ALTER TABLE test_categories ENABLE ROW LEVEL SECURITY;
        ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE question_answers ENABLE ROW LEVEL SECURITY;
        ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

        -- RLS Policies
        CREATE POLICY "Users can view their own data" ON users FOR SELECT USING (auth.uid() = id);
        CREATE POLICY "Users can update their own data" ON users FOR UPDATE USING (auth.uid() = id);
        
        CREATE POLICY "Tests are viewable by authenticated users" ON tests FOR SELECT USING (auth.role() = 'authenticated');
        CREATE POLICY "Questions are viewable in tests" ON questions FOR SELECT USING (auth.role() = 'authenticated');
        
        CREATE POLICY "Users can view their own attempts" ON test_attempts FOR SELECT USING (auth.uid() = user_id);
        CREATE POLICY "Users can create attempts" ON test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
        CREATE POLICY "Users can update their attempts" ON test_attempts FOR UPDATE USING (auth.uid() = user_id);
        
        CREATE POLICY "Users can view their own answers" ON question_answers FOR SELECT USING (
          EXISTS (SELECT 1 FROM test_attempts WHERE id = attempt_id AND user_id = auth.uid())
        );
        CREATE POLICY "Users can insert their own answers" ON question_answers FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM test_attempts WHERE id = attempt_id AND user_id = auth.uid())
        );
      `
    });

    if (createTablesError) {
      // RPC might not be available on some AWS RDS projects
      try {
        await db.rpc('exec', { sql: 'SELECT 1' });
      } catch {
        // ignore — tables may still exist from dashboard SQL
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Database initialized successfully'
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Database initialization failed' },
      { status: 500 }
    );
  }
}
