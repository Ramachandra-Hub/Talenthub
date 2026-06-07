import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

type Sql = postgres.Sql;

type McqSeed = {
  text: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correct: string;
  expl?: string;
};

async function linkQuestionsToTest(sql: Sql, testId: number) {
  await sql`
    INSERT INTO test_questions (test_id, question_id, "order")
    SELECT ${testId}::bigint, q.id, ROW_NUMBER() OVER (ORDER BY q.id)
    FROM questions q WHERE q.test_id = ${testId}::bigint
    ON CONFLICT (test_id, question_id) DO NOTHING
  `;
}

async function upsertTest(
  sql: Sql,
  opts: {
    categoryId: number | undefined;
    title: string;
    description: string;
    duration: number;
    totalQuestions: number;
    difficulty: string;
  }
): Promise<number> {
  if (opts.categoryId == null) {
    throw new Error(`Missing category for test: ${opts.title}`);
  }
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM tests WHERE category_id = ${opts.categoryId} AND title = ${opts.title} LIMIT 1
  `;
  if (existing.length > 0) return Number(existing[0].id);

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO tests (category_id, title, description, duration_minutes, total_questions, difficulty)
    VALUES (
      ${opts.categoryId},
      ${opts.title},
      ${opts.description},
      ${opts.duration},
      ${opts.totalQuestions},
      ${opts.difficulty}
    )
    RETURNING id
  `;
  return Number(inserted[0].id);
}

async function ensureQuestions(sql: Sql, testId: number, rows: McqSeed[]) {
  const count = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM questions WHERE test_id = ${testId}
  `;
  if (count[0].c > 0) {
    await linkQuestionsToTest(sql, testId);
    return;
  }
  for (const r of rows) {
    await sql`
      INSERT INTO questions (test_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer, explanation, marks)
      VALUES (${testId}, ${r.text}, 'mcq', ${r.a}, ${r.b}, ${r.c}, ${r.d}, ${r.correct}, ${r.expl ?? ''}, 1)
    `;
  }
  await linkQuestionsToTest(sql, testId);
}

const quantSet1: McqSeed[] = [
  { text: 'What is 15 + 25?', a: '30', b: '35', c: '40', d: '45', correct: 'C', expl: '15 + 25 = 40' },
  {
    text: 'Find the next number: 2, 4, 8, 16, ?',
    a: '24',
    b: '32',
    c: '64',
    d: '128',
    correct: 'B',
    expl: 'Multiply by 2',
  },
  { text: 'If x = 5, what is 2x + 3?', a: '10', b: '13', c: '15', d: '18', correct: 'B', expl: '2(5) + 3 = 13' },
  { text: 'Average of 10, 20, 30 is?', a: '15', b: '20', c: '25', d: '30', correct: 'B', expl: '(10+20+30)/3 = 20' },
  {
    text: 'What percentage is 25 of 100?',
    a: '20%',
    b: '25%',
    c: '30%',
    d: '35%',
    correct: 'B',
    expl: '25/100 × 100 = 25%',
  },
];

const verbalSet1: McqSeed[] = [
  {
    text: 'Choose the correct spelling:',
    a: 'occured',
    b: 'occured',
    c: 'occurred',
    d: 'occured',
    correct: 'C',
  },
  {
    text: 'Antonym of “bright” is?',
    a: 'shiny',
    b: 'dark',
    c: 'light',
    d: 'clear',
    correct: 'B',
  },
  { text: 'Complete: “She is as strong as ____”', a: 'iron', b: 'steel', c: 'rock', d: 'stone', correct: 'A' },
  {
    text: 'What is usually the “main idea” of a short paragraph?',
    a: 'Supporting details',
    b: 'A concise summary',
    c: 'Every number',
    d: 'Formatting',
    correct: 'B',
  },
  {
    text: 'Choose the grammatically correct sentence:',
    a: 'He go to school',
    b: 'He goes to school',
    c: 'He going to school',
    d: 'He gone to school',
    correct: 'B',
  },
];

const logicalSet1: McqSeed[] = [
  { text: 'If A > B and B > C, then?', a: 'A > C', b: 'A < C', c: 'A = C', d: 'Cannot determine', correct: 'A' },
  { text: 'Complete: 1, 1, 2, 3, 5, ?, 13', a: '7', b: '8', c: '9', d: '10', correct: 'B', expl: 'Fibonacci' },
  { text: 'Odd one out: 2, 4, 6, 9, 10', a: '2', b: '4', c: '9', d: '10', correct: 'C' },
  {
    text: 'All cats are animals. Tom is a cat. Therefore?',
    a: 'Tom is furry',
    b: 'Tom is an animal',
    c: 'Tom eats fish',
    d: 'Tom is fast',
    correct: 'B',
  },
  { text: 'If today is Monday, what day in 10 days?', a: 'Thursday', b: 'Friday', c: 'Saturday', d: 'Sunday', correct: 'A' },
];

const codingSet1: McqSeed[] = [
  {
    text: 'What does HTML stand for?',
    a: 'Hyper Text Markup Language',
    b: 'High Tech Modern Language',
    c: 'Home Tool Markup Language',
    d: 'Hyperlinks and Text Markup Language',
    correct: 'A',
  },
  {
    text: 'In JavaScript, how do you create a function?',
    a: 'function myFunc() {}',
    b: 'def myFunc():',
    c: 'func myFunc() {}',
    d: 'function: myFunc() {}',
    correct: 'A',
  },
  { text: 'Time complexity of binary search?', a: 'O(n)', b: 'O(n²)', c: 'O(log n)', d: 'O(1)', correct: 'C' },
  { text: 'Which data structure uses LIFO?', a: 'Queue', b: 'Stack', c: 'Array', d: 'List', correct: 'B' },
  {
    text: 'What is recursion?',
    a: 'A loop statement',
    b: 'Function calling itself',
    c: 'An array method',
    d: 'A data type',
    correct: 'B',
  },
];

const currentAffairsSet: McqSeed[] = [
  {
    text: 'Current affairs questions test general awareness. Pick the best answer:',
    a: 'Only sports news',
    b: 'Politics, economy, science & world events',
    c: 'Movie trailers',
    d: 'Coding syntax',
    correct: 'B',
  },
  {
    text: 'A good weekly habit for current affairs is:',
    a: 'Ignore news',
    b: 'Skim headlines + one deep read',
    c: 'Memorize random facts without context',
    d: 'Avoid notes',
    correct: 'B',
  },
  { text: '“GDP” most closely relates to:', a: 'Weather', b: 'Economy', c: 'Grammar', d: 'Sports', correct: 'B' },
  {
    text: 'When reading news, prioritise:',
    a: 'Clickbait headlines only',
    b: 'Credibility of the source',
    c: 'Gossip',
    d: 'Fonts',
    correct: 'B',
  },
  { text: 'Geopolitics often involves:', a: 'Cooking', b: 'Relations between countries', c: 'Poetry', d: 'Painting', correct: 'B' },
];

const companySet: McqSeed[] = [
  {
    text: 'Company-specific tests often include:',
    a: 'Recipe writing',
    b: 'Aptitude + role fundamentals',
    c: 'Only music trivia',
    d: 'Painting skills',
    correct: 'B',
  },
  {
    text: 'Before an online assessment, you should:',
    a: 'Skip instructions',
    b: 'Read rules and timing',
    c: 'Close browser tabs randomly',
    d: 'Ignore network check',
    correct: 'B',
  },
  { text: 'Group exercises may assess:', a: 'Solo karaoke', b: 'Collaboration', c: 'Memorizing lyrics', d: 'Painting', correct: 'B' },
  { text: 'HR rounds often gauge:', a: 'Only math speed', b: 'Communication & fit', c: 'Painting', d: 'Cooking', correct: 'B' },
  { text: 'Mock company tests help you:', a: 'Panic', b: 'Build pacing & familiarity', c: 'Skip sleep', d: 'Avoid practice', correct: 'B' },
];

const psychometricSet: McqSeed[] = [
  { text: 'Psychometric items often assess traits like:', a: 'RAM speed', b: 'Personality / preferences', c: 'SQL joins', d: 'Cooking time', correct: 'B' },
  { text: 'Best approach: answer', a: 'Randomly always', b: 'Honestly based on tendency', c: 'All “strongly agree”', d: 'Skip all', correct: 'B' },
  { text: 'There are usually:', a: 'Only wrong answers', b: 'No single perfect profile', c: 'Only math proofs', d: 'Only riddles', correct: 'B' },
  {
    text: 'Consistency improves reliability. That means:',
    a: 'Change answers mid-test wildly',
    b: 'Respond steadily with your preference',
    c: 'Always pick middle option blindly',
    d: 'Close the tab',
    correct: 'B',
  },
  { text: 'Results are interpreted relative to:', a: 'Chef recipes', b: 'Norms / scales', c: 'Stock tickers alone', d: 'Movie genres', correct: 'B' },
];

const mockInterviewSet: McqSeed[] = [
  { text: 'A strong STAR answer focuses on:', a: 'Buzzwords only', b: 'Situation, Task, Action, Result', c: 'Gossip', d: 'Random trivia', correct: 'B' },
  { text: 'When asked weaknesses,:', a: 'Say you have none', b: 'Give a genuine area + improvement steps', c: 'Blame others', d: 'Refuse answer', correct: 'B' },
  { text: 'Mock interviews primarily build:', a: 'Cooking skills', b: 'Confidence & structured speaking', c: 'SQL syntax alone', d: 'Typing wpm always', correct: 'B' },
  { text: 'Good pacing means:', a: 'One-word answers forever', b: 'Clear concise points', c: 'Monologue 20 min', d: 'Silence entire time', correct: 'B' },
  { text: 'After each mock,:', a: 'Ignore feedback', b: 'Reflect on clarity & examples', c: 'Quit practice', d: 'Memorize jokes only', correct: 'B' },
];

export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  try {
    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl || postgresUrl.includes('YOUR_')) {
      return NextResponse.json({ error: 'POSTGRES_URL not configured' }, { status: 400 });
    }

    const sql = postgres(postgresUrl, { max: 1, onnotice: () => {} });

    console.log('Starting database seeding...');

    await sql`
      INSERT INTO test_categories (name, slug, description, icon)
      VALUES 
        ('Quantitative Ability', 'quantitative', 'Mathematics, numerical ability, and problem-solving', '📊'),
        ('Verbal Ability', 'verbal', 'English language, comprehension, and grammar', '📖'),
        ('Logical Reasoning', 'logical', 'Logic puzzles, pattern recognition, and analytical thinking', '🧠'),
        ('Coding', 'coding', 'Programming, data structures, and algorithms', '💻'),
        ('Current Affairs', 'current-affairs', 'Current events and general knowledge', '📰'),
        ('Company Specific', 'companies', 'Company-specific placement preparation', '🏢'),
        ('Psychometric Prep', 'psychometric', 'Personality and behavioral style questions', '🎭'),
        ('Mock Interview Prep', 'mock-interviews', 'Communication and structured interview drills', '🎤')
      ON CONFLICT (slug) DO NOTHING
    `;

    await sql`
      UPDATE test_categories
      SET slug = 'company-specific', name = 'Company Specific'
      WHERE slug = 'companies'
    `;

    type CatRow = { id: string; slug: string };
    const categories = await sql<CatRow[]>`
      SELECT id, slug FROM test_categories ORDER BY slug
    `;
    const bySlug = (slug: string) => categories.find((c) => c.slug === slug)?.id;

    const n = (id: string | undefined) => (id === undefined ? undefined : Number(id));

    let quantT1 = await upsertTest(sql, {
      categoryId: n(bySlug('quantitative')),
      title: 'Quantitative Test 1',
      description: 'Basic quantitative reasoning',
      duration: 30,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    let quantT2 = await upsertTest(sql, {
      categoryId: n(bySlug('quantitative')),
      title: 'Quantitative Test 2',
      description: 'Advanced quantitative problems',
      duration: 40,
      totalQuestions: 5,
      difficulty: 'hard',
    });
    await ensureQuestions(sql, quantT1, quantSet1);
    await ensureQuestions(sql, quantT2, quantSet1.map((x) => ({ ...x, text: x.text + ' (Set 2)' })));

    let verbalT1 = await upsertTest(sql, {
      categoryId: n(bySlug('verbal')),
      title: 'Verbal Test 1',
      description: 'Basic English comprehension',
      duration: 30,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    let verbalT2 = await upsertTest(sql, {
      categoryId: n(bySlug('verbal')),
      title: 'Verbal Test 2',
      description: 'Advanced reading and grammar',
      duration: 40,
      totalQuestions: 5,
      difficulty: 'hard',
    });
    await ensureQuestions(sql, verbalT1, verbalSet1);
    await ensureQuestions(sql, verbalT2, verbalSet1.map((x) => ({ ...x, text: x.text + ' (Set 2)' })));

    let logicalT1 = await upsertTest(sql, {
      categoryId: n(bySlug('logical')),
      title: 'Logical Reasoning Test 1',
      description: 'Basic puzzles and patterns',
      duration: 30,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    let logicalT2 = await upsertTest(sql, {
      categoryId: n(bySlug('logical')),
      title: 'Logical Reasoning Test 2',
      description: 'Complex logic problems',
      duration: 40,
      totalQuestions: 5,
      difficulty: 'hard',
    });
    await ensureQuestions(sql, logicalT1, logicalSet1);
    await ensureQuestions(sql, logicalT2, logicalSet1.map((x) => ({ ...x, text: x.text + ' (Set 2)' })));

    let codingT1 = await upsertTest(sql, {
      categoryId: n(bySlug('coding')),
      title: 'Coding Test 1',
      description: 'Basic programming concepts',
      duration: 45,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    let codingT2 = await upsertTest(sql, {
      categoryId: n(bySlug('coding')),
      title: 'Coding Test 2',
      description: 'Algorithms focus',
      duration: 60,
      totalQuestions: 5,
      difficulty: 'hard',
    });
    await ensureQuestions(sql, codingT1, codingSet1);
    await ensureQuestions(sql, codingT2, codingSet1.map((x) => ({ ...x, text: x.text + ' (Set 2)' })));

    const caTest = await upsertTest(sql, {
      categoryId: n(bySlug('current-affairs')),
      title: 'Current Affairs Quick Test',
      description: 'Short awareness drill',
      duration: 20,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    await ensureQuestions(sql, caTest, currentAffairsSet);

    const coTest = await upsertTest(sql, {
      categoryId: n(bySlug('company-specific')),
      title: 'Company Preparation Quiz',
      description: 'Common placement-focused prompts',
      duration: 25,
      totalQuestions: 5,
      difficulty: 'medium',
    });
    await ensureQuestions(sql, coTest, companySet);

    const psyTest = await upsertTest(sql, {
      categoryId: n(bySlug('psychometric')),
      title: 'Psychometric Practice Set',
      description: 'Style and preference practice',
      duration: 20,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    await ensureQuestions(sql, psyTest, psychometricSet);

    const mockTest = await upsertTest(sql, {
      categoryId: n(bySlug('mock-interviews')),
      title: 'Mock Interview Foundations',
      description: 'Behavioral answer practice',
      duration: 20,
      totalQuestions: 5,
      difficulty: 'easy',
    });
    await ensureQuestions(sql, mockTest, mockInterviewSet);

    const allTests = await sql<{ id: string }[]>`SELECT id FROM tests`;
    for (const t of allTests) {
      await linkQuestionsToTest(sql, Number(t.id));
    }

    await sql`
      INSERT INTO blog_posts (slug, title, excerpt, content, author, published_at)
      VALUES 
        ('placement-tips', 'How to Prepare for Placements', 'A comprehensive guide to prepare for campus placements', 'Start your preparation 3-4 months before placements. Focus on core concepts, practice problems regularly, and take mock tests. Learn from previous year questions.', 'PrepIndia', NOW()),
        ('quant-tips', 'Quantitative Aptitude Tips', 'Master quantitative reasoning in 30 days', 'Practice mental math, learn shortcuts, focus on speed and accuracy. Start with basic concepts, then move to advanced problems.', 'PrepIndia', NOW()),
        ('time-management', 'Time Management During Exams', 'Master the art of time management', 'Allocate time based on difficulty. Attempt easy questions first. Skip tough questions and come back later.', 'PrepIndia', NOW())
      ON CONFLICT (slug) DO NOTHING
    `;

    console.log('Blog posts ensured');

    await sql.end();

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully (categories, tests, questions, test_questions links)',
    });
  } catch (error) {
    console.error('Seeding error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Seeding failed',
        details: String(error),
      },
      { status: 500 }
    );
  }
}
