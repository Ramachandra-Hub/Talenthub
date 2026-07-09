import { prisma } from '@/lib/prisma';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import {
  buildCodingQuestionPayload,
  parseStoredCodingProblem,
} from '@/lib/coding/coding-bank-persist';

export const CODING_BANK_TAG_ALL = 'coding-problems';
export const CODING_BANK_TAG_C = 'coding-c';
export const CODING_BANK_TAG_PYTHON = 'coding-python';

const TAG_LABELS: Record<string, string> = {
  [CODING_BANK_TAG_ALL]: 'Coding problems (all)',
  [CODING_BANK_TAG_C]: 'Coding — C',
  [CODING_BANK_TAG_PYTHON]: 'Coding — Python',
};

async function ensureCodingTag(slug: string) {
  const existing = await prisma.questionTag.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.questionTag.create({
    data: { slug, name: TAG_LABELS[slug] ?? slug },
  });
}

function langTagSlug(lang: 'c' | 'python'): string {
  return lang === 'python' ? CODING_BANK_TAG_PYTHON : CODING_BANK_TAG_C;
}

export async function insertCodingProblemsIntoBank(
  problems: ProgrammingProblem[],
  defaultLanguage: 'c' | 'python',
): Promise<ProgrammingProblem[]> {
  if (!problems.length) return [];

  const langTag = await ensureCodingTag(langTagSlug(defaultLanguage));
  const allTag = await ensureCodingTag(CODING_BANK_TAG_ALL);
  const created: ProgrammingProblem[] = [];

  for (const problem of problems) {
    const payload = buildCodingQuestionPayload(problem, defaultLanguage);
    const row = await prisma.question.create({
      data: {
        questionText: payload.questionText,
        questionType: payload.questionType,
        type: payload.type,
        difficulty: payload.difficulty,
        correctAnswer: payload.correctAnswer,
        explanation: payload.explanation,
        tags: payload.tags,
      },
    });

    await prisma.questionTagLink.createMany({
      data: [
        { questionId: row.id, tagId: langTag.id },
        { questionId: row.id, tagId: allTag.id },
      ],
      skipDuplicates: true,
    });

    created.push({ ...problem, id: row.id });
  }

  return created;
}

export async function loadCodingBankFromDb(options?: {
  search?: string;
  language?: 'c' | 'python' | 'all';
  limit?: number;
}): Promise<ProgrammingProblem[]> {
  const language = options?.language ?? 'all';
  const tagSlug =
    language === 'python'
      ? CODING_BANK_TAG_PYTHON
      : language === 'c'
        ? CODING_BANK_TAG_C
        : CODING_BANK_TAG_ALL;

  const tag = await prisma.questionTag.findUnique({ where: { slug: tagSlug } });
  if (!tag) return [];

  const links = await prisma.questionTagLink.findMany({
    where: { tagId: tag.id },
    select: { questionId: true },
    orderBy: { questionId: 'desc' },
  });

  const ids = links.map((l) => l.questionId);
  if (!ids.length) return [];

  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);
  const rows = await prisma.question.findMany({
    where: { id: { in: ids }, type: 'CODING' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const search = options?.search?.trim().toLowerCase();
  const problems: ProgrammingProblem[] = [];

  for (const row of rows) {
    const stored = parseStoredCodingProblem(row.explanation);
    if (!stored) continue;
    const problem = { ...stored.problem, id: row.id };
    if (search) {
      const hay = `${problem.title} ${problem.statement}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }
    problems.push(problem);
  }

  return problems;
}

export async function ensureCodingBankTags(): Promise<void> {
  await ensureCodingTag(CODING_BANK_TAG_ALL);
  await ensureCodingTag(CODING_BANK_TAG_C);
  await ensureCodingTag(CODING_BANK_TAG_PYTHON);
}
