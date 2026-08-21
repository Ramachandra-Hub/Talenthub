import { ensureRdsSchemaReadyForWrites } from '@/lib/db/ensure-rds-schema';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const CATEGORIES = [
  { name: 'Quantitative Ability', slug: 'quantitative', description: 'Mathematics and numerical ability', icon: '📊', order: 1 },
  { name: 'Verbal Ability', slug: 'verbal', description: 'English comprehension and grammar', icon: '📖', order: 2 },
  { name: 'Logical Reasoning', slug: 'logical', description: 'Logic puzzles and patterns', icon: '🧠', order: 3 },
  { name: 'Coding', slug: 'coding', description: 'Programming and algorithms', icon: '💻', order: 4 },
  { name: 'Current Affairs', slug: 'current-affairs', description: 'General knowledge', icon: '📰', order: 5 },
  { name: 'Company Specific', slug: 'company-specific', description: 'Company placement prep', icon: '🏢', order: 6 },
  { name: 'Psychometric Prep', slug: 'psychometric', description: 'Personality assessments', icon: '🎭', order: 7 },
  { name: 'Mock Interview Prep', slug: 'mock-interviews', description: 'Interview practice', icon: '🎤', order: 8 },
  { name: 'RMSET', slug: 'rmset', description: 'Multi-section eligibility test', icon: '📋', order: 9 },
] as const;

type Mcq = { text: string; a: string; b: string; c: string; d: string; correct: string; expl?: string };

const SAMPLE_MCQS: Mcq[] = [
  { text: 'What is 15 + 25?', a: '30', b: '35', c: '40', d: '45', correct: 'C', expl: '15 + 25 = 40' },
  { text: 'Find the next number: 2, 4, 8, 16, ?', a: '24', b: '32', c: '64', d: '128', correct: 'B', expl: 'Multiply by 2' },
  { text: 'Synonym of "Abundant"?', a: 'Scarce', b: 'Plentiful', c: 'Tiny', d: 'Weak', correct: 'B' },
  { text: 'If all cats are animals, and some animals are pets, which is valid?', a: 'All cats are pets', b: 'Some cats may be pets', c: 'No cats are pets', d: 'All pets are cats', correct: 'B' },
  { text: 'What does HTML stand for?', a: 'Hyper Text Markup Language', b: 'High Transfer Machine Language', c: 'Home Tool Markup Language', d: 'None', correct: 'A' },
];

export async function seedRdsBaseline(): Promise<{
  categories: number;
  tests: number;
  questions: number;
}> {
  await ensureRdsSchemaReadyForWrites();

  const categoryIds = new Map<string, string>();

  for (const cat of CATEGORIES) {
    const row = await prisma.testCategory.upsert({
      where: { slug: cat.slug },
      create: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        order: cat.order,
      },
      update: {
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        order: cat.order,
      },
    });
    categoryIds.set(cat.slug, row.id);
  }

  let testsCreated = 0;
  let questionsCreated = 0;

  for (const slug of ['quantitative', 'verbal', 'logical', 'coding'] as const) {
    const categoryId = categoryIds.get(slug);
    if (!categoryId) continue;

    const title = `${slug.charAt(0).toUpperCase() + slug.slice(1)} Practice Test 1`;
    const existing = await prisma.test.findFirst({
      where: { categoryId, title },
    });

    const test =
      existing ??
      (await prisma.test.create({
        data: {
          categoryId,
          title,
          name: title,
          description: `Sample ${slug} practice test`,
          durationMinutes: 30,
          totalQuestions: SAMPLE_MCQS.length,
          difficulty: 'easy',
        },
      }));

    if (!existing) testsCreated++;

    const qCount = await prisma.question.count({ where: { testId: test.id } });
    if (qCount === 0) {
      for (const mcq of SAMPLE_MCQS) {
        const q = await prisma.question.create({
          data: {
            testId: test.id,
            questionText: mcq.text,
            questionType: 'MCQ',
            type: 'MCQ',
            optionA: mcq.a,
            optionB: mcq.b,
            optionC: mcq.c,
            optionD: mcq.d,
            correctAnswer: mcq.correct,
            explanation: mcq.expl ?? null,
            marks: 1,
          },
        });
        await prisma.testQuestion.upsert({
          where: { testId_questionId: { testId: test.id, questionId: q.id } },
          create: { testId: test.id, questionId: q.id, sortOrder: questionsCreated },
          update: {},
        });
        questionsCreated++;
      }
    }
  }

  return {
    categories: categoryIds.size,
    tests: testsCreated,
    questions: questionsCreated,
  };
}

export async function bootstrapRdsAdmin(): Promise<{ email: string; created: boolean }> {
  await ensureRdsSchemaReadyForWrites();

  const { getConfiguredAdminEmail, requireConfiguredAdminPassword } = await import(
    '@/lib/admin-defaults'
  );
  const email = getConfiguredAdminEmail();
  const password = requireConfiguredAdminPassword();
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: hash,
      fullName: 'RCE Training & Placement Admin',
    },
    update: { passwordHash: hash },
  });

  const existingAdmin = await prisma.adminUser.findUnique({ where: { userId: user.id } });
  if (!existingAdmin) {
    await prisma.adminUser.create({ data: { userId: user.id, role: 'admin' } });
  }

  return { email, created: !existingAdmin };
}
