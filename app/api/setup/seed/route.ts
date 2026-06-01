import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';

const isDatabaseConfigured =
  !!process.env.DATABASE_URL?.trim() &&
  !!process.env.AUTH_SECRET?.trim() &&
  !process.env.DATABASE_URL.includes('YOUR_') &&
  !process.env.AUTH_SECRET.includes('YOUR_');

export async function POST() {
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json(
        { error: 'Set DATABASE_URL and AUTH_SECRET in .env.local' },
        { status: 500 }
      );
    }

    const db = getDbService();

    const categories = [
      { name: 'Quantitative Ability', slug: 'quantitative', description: 'Mathematics, numerical ability, and problem-solving', icon: '📊' },
      { name: 'Verbal Ability', slug: 'verbal', description: 'English language, comprehension, and grammar', icon: '📖' },
      { name: 'Logical Reasoning', slug: 'logical', description: 'Logic puzzles, pattern recognition, and analytical thinking', icon: '🧠' },
      { name: 'Coding', slug: 'coding', description: 'Programming, data structures, and algorithms', icon: '💻' },
      { name: 'Current Affairs', slug: 'current-affairs', description: 'Current events and general knowledge', icon: '📰' },
      { name: 'Company Specific', slug: 'company-specific', description: 'Company-specific placement preparation', icon: '🏢' },
      { name: 'Psychometric Prep', slug: 'psychometric', description: 'Personality and behavioral style questions', icon: '🎭' },
      { name: 'Mock Interview Prep', slug: 'mock-interviews', description: 'Communication and structured interview drills', icon: '🎤' },
    ];

    const { error: categoryError } = await db
      .from('test_categories')
      .upsert(categories, { onConflict: 'slug' });
    if (categoryError) console.warn('Category upsert warning:', categoryError);

    const { data: allCategories, error: allCategoriesError } = await db
      .from('test_categories')
      .select('id, slug');
    if (allCategoriesError) throw allCategoriesError;
    const categoryMap =
      allCategories?.reduce((map: Record<string, string>, cat: { id: string; slug: string }) => {
        map[cat.slug] = cat.id;
        return map;
      }, {}) ?? {};

    const tests = [
      { slug: 'quantitative', title: 'Quantitative Test 1', description: 'Basic quantitative reasoning', duration_minutes: 30, total_questions: 5, difficulty: 'easy' },
      { slug: 'quantitative', title: 'Quantitative Test 2', description: 'Advanced quantitative problems', duration_minutes: 40, total_questions: 5, difficulty: 'hard' },
      { slug: 'verbal', title: 'Verbal Test 1', description: 'Basic English comprehension', duration_minutes: 30, total_questions: 5, difficulty: 'easy' },
      { slug: 'logical', title: 'Logical Reasoning Test 1', description: 'Basic puzzles and patterns', duration_minutes: 30, total_questions: 5, difficulty: 'easy' },
      { slug: 'coding', title: 'Coding Test 1', description: 'Basic programming concepts', duration_minutes: 45, total_questions: 5, difficulty: 'easy' },
      { slug: 'current-affairs', title: 'Current Affairs Quick Test', description: 'Short awareness drill', duration_minutes: 20, total_questions: 5, difficulty: 'easy' },
      { slug: 'company-specific', title: 'Company Preparation Quiz', description: 'Common placement-focused prompts', duration_minutes: 25, total_questions: 5, difficulty: 'medium' },
      { slug: 'psychometric', title: 'Psychometric Practice Set', description: 'Style and preference practice', duration_minutes: 20, total_questions: 5, difficulty: 'easy' },
      { slug: 'mock-interviews', title: 'Mock Interview Foundations', description: 'Behavioral answer practice', duration_minutes: 20, total_questions: 5, difficulty: 'easy' },
    ];

    let testsSeeded = 0;
    let questionsSeeded = 0;
    for (const seedTest of tests) {
      const categoryId = categoryMap[seedTest.slug];
      if (!categoryId) continue;

      const { data: existingTest } = await db
        .from('tests')
        .select('id, title')
        .eq('category_id', categoryId)
        .eq('title', seedTest.title)
        .maybeSingle();

      let testId = existingTest?.id as string | undefined;
      if (!testId) {
        const { data: created, error: createTestError } = await db
          .from('tests')
          .insert({
            category_id: categoryId,
            title: seedTest.title,
            description: seedTest.description,
            duration_minutes: seedTest.duration_minutes,
            total_questions: seedTest.total_questions,
            difficulty: seedTest.difficulty,
          })
          .select('id')
          .single();
        if (createTestError) throw createTestError;
        testId = created.id as string;
        testsSeeded += 1;
      }

      const { count } = await db
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('test_id', testId);

      if ((count ?? 0) === 0) {
        const rows = Array.from({ length: 5 }).map((_, idx) => ({
          test_id: testId,
          question_text: `${seedTest.title} - Question ${idx + 1}`,
          question_type: 'mcq',
          option_a: 'Option A',
          option_b: 'Option B',
          option_c: 'Option C',
          option_d: 'Option D',
          correct_answer: 'B',
          explanation: 'Sample seeded explanation',
          marks: 1,
        }));
        const { data: insertedQuestions, error: questionError } = await db
          .from('questions')
          .insert(rows)
          .select('id');
        if (questionError) throw questionError;
        questionsSeeded += insertedQuestions?.length ?? 0;

        if (insertedQuestions?.length) {
          const links = insertedQuestions.map((q, idx) => ({
            test_id: testId,
            question_id: q.id,
            order: idx + 1,
          }));
          const { error: linkError } = await db
            .from('test_questions')
            .upsert(links, { onConflict: 'test_id,question_id' });
          if (linkError) console.warn('Question link warning:', linkError);
        }
      }
    }

    // Insert sample blog posts
    const { error: blogError } = await db
      .from('blog_posts')
      .upsert([
        {
          slug: 'how-to-prepare-for-placements',
          title: 'Complete Guide: How to Prepare for Placements',
          excerpt: 'Learn the ultimate strategy to ace your placement drive',
          content: 'This comprehensive guide covers all aspects of placement preparation...',
          author: 'PrepIndia Team',
          published_at: new Date(),
        },
        {
          slug: 'quantitative-aptitude-tips',
          title: 'Top 10 Quantitative Aptitude Tips',
          excerpt: 'Master quantitative reasoning with these proven tips',
          content: 'Quantitative aptitude is crucial for placements. Here are our top tips...',
          author: 'Expert Mentor',
          published_at: new Date(),
        },
        {
          slug: 'time-management-in-exams',
          title: 'Master Time Management in Exams',
          excerpt: 'Learn how to effectively manage your time during tests',
          content: 'Time management is key to scoring well. Learn practical strategies...',
          author: 'PrepIndia Team',
          published_at: new Date(),
        },
      ], { onConflict: 'slug', ignoreDuplicates: false });

    if (blogError) {
      console.warn('Blog insert warning:', blogError);
    }

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      stats: {
        categories: allCategories?.length || 0,
        tests_seeded: testsSeeded,
        questions_seeded: questionsSeeded,
      },
    });
  } catch (error) {
    console.error('Seeding error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Seeding failed',
        stack: error instanceof Error ? error.stack : '',
      },
      { status: 500 }
    );
  }
}
