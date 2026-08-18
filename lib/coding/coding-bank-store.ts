import { prisma } from '@/lib/prisma';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import {
  buildCodingQuestionPayload,
  parseStoredCodingProblem,
} from '@/lib/coding/coding-bank-persist';
import { JAVA_ARRAY_PROBLEMS } from '@/lib/coding/java-array-problems';
import { JAVA_CORE_50_PROBLEMS } from '@/lib/coding/java-core50-problems';

export const CODING_BANK_TAG_ALL = 'coding-problems';
export const CODING_BANK_TAG_C = 'coding-c';
export const CODING_BANK_TAG_PYTHON = 'coding-python';
export const CODING_BANK_TAG_JAVA = 'coding-java';

export type CodingBankLanguage = 'c' | 'python' | 'java';

const TAG_LABELS: Record<string, string> = {
  [CODING_BANK_TAG_ALL]: 'Coding problems (all)',
  [CODING_BANK_TAG_C]: 'Coding — C',
  [CODING_BANK_TAG_PYTHON]: 'Coding — Python',
  [CODING_BANK_TAG_JAVA]: 'Coding — Java',
};

async function ensureCodingTag(slug: string) {
  const existing = await prisma.questionTag.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.questionTag.create({
    data: { slug, name: TAG_LABELS[slug] ?? slug },
  });
}

function langTagSlug(lang: CodingBankLanguage): string {
  if (lang === 'python') return CODING_BANK_TAG_PYTHON;
  if (lang === 'java') return CODING_BANK_TAG_JAVA;
  return CODING_BANK_TAG_C;
}

export async function insertCodingProblemsIntoBank(
  problems: ProgrammingProblem[],
  defaultLanguage: CodingBankLanguage,
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
  language?: CodingBankLanguage | 'all';
  limit?: number;
}): Promise<ProgrammingProblem[]> {
  const language = options?.language ?? 'all';
  const tagSlug =
    language === 'python'
      ? CODING_BANK_TAG_PYTHON
      : language === 'java'
        ? CODING_BANK_TAG_JAVA
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
    const problem = { ...stored.problem, id: row.id, starterCode: undefined };
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
  await ensureCodingTag(CODING_BANK_TAG_JAVA);
}

/** Insert the 20 Java array DSA problems once (skips titles already in the Java bank). */
export async function ensureJavaArrayCodingBank(): Promise<{ inserted: number }> {
  await ensureCodingBankTags();
  const existing = await loadCodingBankFromDb({ language: 'java', limit: 500 });
  const have = new Set(
    existing.map((p) =>
      String(p.title ?? '')
        .trim()
        .toLowerCase(),
    ),
  );
  const missing = JAVA_ARRAY_PROBLEMS.filter((p) => !have.has(p.title.trim().toLowerCase()));
  if (!missing.length) return { inserted: 0 };
  const created = await insertCodingProblemsIntoBank(missing, 'java');
  return { inserted: created.length };
}

/** Insert the Java core 50 coding problems once (skips titles already in Java bank). */
export async function ensureJavaCore50CodingBank(): Promise<{ inserted: number }> {
  await ensureCodingBankTags();
  const existing = await loadCodingBankFromDb({ language: 'java', limit: 1000 });
  const have = new Set(
    existing.map((p) =>
      String(p.title ?? '')
        .trim()
        .toLowerCase(),
    ),
  );
  const missing = JAVA_CORE_50_PROBLEMS.filter((p) => !have.has(p.title.trim().toLowerCase()));
  if (!missing.length) return { inserted: 0 };
  const created = await insertCodingProblemsIntoBank(missing, 'java');
  return { inserted: created.length };
}
