import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { ensureDsaCurriculum } from '@/lib/dsa/ensure-curriculum';
import { ensureDsaContestTables } from '@/lib/dsa/contest/ensure-tables';
import {
  CONTEST_BANK_PREFIX,
  CONTEST_POINTS_PER_PROBLEM,
  CONTEST_PROBLEM_COUNT,
} from '@/lib/dsa/contest/types';
import {
  validateQuestionBank,
  type ValidatedBankQuestion,
} from '@/lib/dsa/contest/question-bank';
import { contestProblemStarter, slugForBankProblem } from '@/lib/dsa/contest/starters';

export function resolveQuestionBankPath(explicit?: string): string {
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = [
    path.join(process.cwd(), 'data', 'exam_portal_questions_with_solutions(2).json'),
    path.join(process.cwd(), 'data', 'exam_portal_questions_with_solutions(1).json'),
    path.join(process.cwd(), 'data', 'exam_portal_questions_with_solutions.json'),
    path.join(process.cwd(), 'exam_portal_questions_with_solutions(2).json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    'Question bank JSON not found. Place exam_portal_questions_with_solutions(2).json under data/.',
  );
}

function topicSlugForCategory(category: string): string {
  return (
    'contest-' +
    category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  );
}

async function ensureTopic(category: string) {
  const slug = topicSlugForCategory(category);
  return prisma.dsaTopic.upsert({
    where: { slug },
    create: { slug, name: category, parentSlug: 'arena-contest' },
    update: { name: category },
  });
}

export async function upsertContestBankProblem(q: ValidatedBankQuestion) {
  const topic = await ensureTopic(q.category);
  const sourceBankKey = `${CONTEST_BANK_PREFIX}:${q.sourceId}`;
  const slug = slugForBankProblem(q.sourceId, q.title);
  const testCasesJson = [
    {
      input: q.sampleInput,
      expectedOutput: q.sampleOutput,
      hidden: false,
      explanation: 'Sample from question bank',
    },
  ];
  const starterCodeJson = {
    java: contestProblemStarter('java'),
    python: contestProblemStarter('python'),
  };
  const referenceSolutionsJson = {
    ...(q.javaReference ? { java: q.javaReference } : {}),
    ...(q.pythonReference ? { python: q.pythonReference } : {}),
    _auditNotes: q.referenceAuditNotes,
  };

  return prisma.dsaProblem.upsert({
    where: { sourceBankKey },
    create: {
      slug,
      title: q.title,
      statement: q.statement,
      constraints: q.constraintsText,
      inputFormat: q.inputFormat,
      outputFormat: q.outputFormat,
      examplesJson: [
        { input: q.sampleInput, expectedOutput: q.sampleOutput },
      ],
      topicId: topic.id,
      conceptSlug: topic.slug,
      difficulty: q.difficulty,
      hintsJson: [],
      explanation: null,
      studentExplanation: q.studentExplanation,
      starterCodeJson,
      testCasesJson,
      languagesJson: ['java', 'python'],
      sourceBankKey,
      categoryLabel: q.category,
      tagsJson: q.tags,
      referenceSolutionsJson,
      referenceSolutionStatus: q.referenceSolutionStatus,
      timeLimitMs: 8000,
      memoryLimitKb: null,
      contestBank: true,
      isActive: true,
    },
    update: {
      title: q.title,
      statement: q.statement,
      constraints: q.constraintsText,
      inputFormat: q.inputFormat,
      outputFormat: q.outputFormat,
      examplesJson: [
        { input: q.sampleInput, expectedOutput: q.sampleOutput },
      ],
      topicId: topic.id,
      conceptSlug: topic.slug,
      difficulty: q.difficulty,
      studentExplanation: q.studentExplanation,
      starterCodeJson,
      testCasesJson,
      languagesJson: ['java', 'python'],
      categoryLabel: q.category,
      tagsJson: q.tags,
      referenceSolutionsJson,
      referenceSolutionStatus: q.referenceSolutionStatus,
      contestBank: true,
      isActive: true,
    },
  });
}

/**
 * Deterministic balanced contest grouping:
 * one problem from each major category family when possible.
 */
export function buildContestTriples(sourceIds: number[]): number[][] {
  const triples: number[][] = [];
  // Fixed balanced packs from known bank layout (1-20 WTPQ, 21-30 IBT, 31-40 RTDFS, 41-50 UTP)
  const packs: number[][] = [
    [1, 21, 31],
    [2, 22, 41],
    [3, 23, 32],
    [4, 24, 42],
    [5, 25, 33],
    [6, 26, 43],
    [7, 27, 34],
    [8, 28, 44],
    [9, 29, 35],
    [10, 30, 45],
    [11, 36, 46],
    [12, 37, 47],
    [13, 38, 48],
    [14, 39, 49],
    [15, 40, 50],
    [16, 17, 18],
  ];
  const idSet = new Set(sourceIds);
  for (const pack of packs) {
    if (pack.every((id) => idSet.has(id)) && new Set(pack).size === CONTEST_PROBLEM_COUNT) {
      triples.push(pack);
    }
  }
  return triples;
}

export async function ensureSeededContests(
  problemsBySourceId: Map<number, { id: string; title: string; difficulty: string; categoryLabel: string | null }>,
) {
  const triples = buildContestTriples([...problemsBySourceId.keys()]);
  const created: Array<{ slug: string; title: string; sourceIds: number[] }> = [];

  for (let i = 0; i < triples.length; i += 1) {
    const pack = triples[i]!;
    const n = String(i + 1).padStart(2, '0');
    const slug = `dsa-arena-coding-contest-${n}`;
    const titles = pack.map((id) => problemsBySourceId.get(id)?.title ?? `#${id}`);
    const title = `DSA Arena Coding Challenge ${n}`;
    const description = `Three coding problems: ${titles.join(' · ')}. Java and Python. Server-side grading.`;
    const instructions = [
      'Solve exactly 3 coding problems.',
      'You may use Java or Python per problem.',
      'Run Code uses sample input only.',
      'Submit grades against server tests (sample + any hidden tests).',
      'IV Year eligibility is enforced server-side.',
      'Results are calculated on the server — not in the browser.',
    ].join('\n');

    const contest = await prisma.dsaCodingContest.upsert({
      where: { slug },
      create: {
        slug,
        title,
        description,
        instructions,
        difficulty: 'mixed',
        status: 'active',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2027-12-31T23:59:59.000Z'),
        durationMinutes: 60,
        isPublished: true,
        isActive: true,
      },
      update: {
        title,
        description,
        instructions,
        status: 'active',
        isPublished: true,
        isActive: true,
        durationMinutes: 60,
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2027-12-31T23:59:59.000Z'),
      },
    });

    // Replace problem links idempotently
    await prisma.dsaCodingContestProblem.deleteMany({ where: { contestId: contest.id } });
    for (let pos = 0; pos < pack.length; pos += 1) {
      const sourceId = pack[pos]!;
      const problem = problemsBySourceId.get(sourceId);
      if (!problem) continue;
      await prisma.dsaCodingContestProblem.create({
        data: {
          contestId: contest.id,
          problemId: problem.id,
          position: pos + 1,
          points: CONTEST_POINTS_PER_PROBLEM,
        },
      });
    }
    created.push({ slug, title, sourceIds: pack });
  }
  return created;
}

export async function importDsaCodingQuestionBank(options?: {
  filePath?: string;
  seedContests?: boolean;
}) {
  await ensureDsaCurriculum();
  await ensureDsaContestTables();
  const filePath = resolveQuestionBankPath(options?.filePath);
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const validated = validateQuestionBank(raw);
  if (!validated.ok) {
    const msg = validated.issues
      .filter((i) => i.level === 'error')
      .map((i) => `${i.questionId ?? '-'}: ${i.message}`)
      .join('\n');
    throw new Error(`Question bank validation failed:\n${msg}`);
  }

  const bySource = new Map<
    number,
    { id: string; title: string; difficulty: string; categoryLabel: string | null }
  >();

  for (const q of validated.questions) {
    const row = await upsertContestBankProblem(q);
    bySource.set(q.sourceId, {
      id: row.id,
      title: row.title,
      difficulty: row.difficulty,
      categoryLabel: row.categoryLabel,
    });
  }

  let contests: Array<{ slug: string; title: string; sourceIds: number[] }> = [];
  if (options?.seedContests !== false) {
    contests = await ensureSeededContests(bySource);
  }

  const assignedIds = new Set(contests.flatMap((c) => c.sourceIds));
  const poolRemaining = validated.questions
    .map((q) => q.sourceId)
    .filter((id) => !assignedIds.has(id));

  return {
    filePath,
    questionCountExpected: 50,
    imported: validated.questions.length,
    rejected: validated.issues.filter((i) => i.level === 'error').length,
    duplicates: validated.issues.filter((i) => /duplicate/i.test(i.message)).length,
    invalid: validated.issues.filter(
      (i) => i.level === 'error' && !/duplicate/i.test(i.message),
    ).length,
    issues: validated.issues,
    contests,
    questionsAssignedToContests: assignedIds.size,
    poolRemainingSourceIds: poolRemaining,
  };
}
