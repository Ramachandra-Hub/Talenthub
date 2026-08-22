import { prisma } from '@/lib/prisma';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import {
  buildCodingQuestionPayload,
  parseStoredCodingProblem,
  CODING_UPLOAD_TAG,
  type CodingProblemSource,
} from '@/lib/coding/coding-bank-persist';
import { JAVA_ARRAY_PROBLEMS } from '@/lib/coding/java-array-problems';
import { JAVA_CORE_50_PROBLEMS } from '@/lib/coding/java-core50-problems';

export const CODING_BANK_TAG_ALL = 'coding-problems';
export const CODING_BANK_TAG_C = 'coding-c';
export const CODING_BANK_TAG_PYTHON = 'coding-python';
export const CODING_BANK_TAG_JAVA = 'coding-java';

export type CodingBankLanguage = 'c' | 'python' | 'java';

const CATALOG_JAVA_TITLES = new Set(
  [...JAVA_CORE_50_PROBLEMS, ...JAVA_ARRAY_PROBLEMS].map((p) => p.title.trim().toLowerCase()),
);

const CATALOG_JAVA_IDS = new Set(
  [...JAVA_CORE_50_PROBLEMS, ...JAVA_ARRAY_PROBLEMS].map((p) => p.id.trim().toLowerCase()),
);

const TAG_LABELS: Record<string, string> = {
  [CODING_BANK_TAG_ALL]: 'Coding problems (all)',
  [CODING_BANK_TAG_C]: 'Coding — C',
  [CODING_BANK_TAG_PYTHON]: 'Coding — Python',
  [CODING_BANK_TAG_JAVA]: 'Coding — Java',
  [CODING_UPLOAD_TAG]: 'Uploaded coding (document)',
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

export function isCatalogJavaCodingProblem(problem: { id?: string; title?: string }): boolean {
  const id = String(problem.id ?? '').trim().toLowerCase();
  if (id && CATALOG_JAVA_IDS.has(id)) return true;
  if (id.startsWith('java50-') || id.startsWith('java-')) return true;
  const title = String(problem.title ?? '').trim().toLowerCase();
  return Boolean(title) && CATALOG_JAVA_TITLES.has(title);
}

function questionTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  return [];
}

export function isUploadedCodingProblem(input: {
  storedId?: string | null;
  title?: string | null;
  source?: CodingProblemSource | null;
  tags?: unknown;
}): boolean {
  if (input.source === 'catalog') return false;
  if (isCatalogJavaCodingProblem({ id: input.storedId ?? '', title: input.title ?? '' })) {
    return false;
  }
  if (input.source === 'upload') return true;
  const id = String(input.storedId ?? '').trim().toLowerCase();
  if (id.startsWith('upload-')) return true;
  const tags = questionTags(input.tags).map((t) => t.toLowerCase());
  if (tags.includes(CODING_UPLOAD_TAG) || tags.includes('source:upload')) return true;
  // Non-catalog rows in the Java coding bank came from an admin upload/document.
  return true;
}

export async function insertCodingProblemsIntoBank(
  problems: ProgrammingProblem[],
  defaultLanguage: CodingBankLanguage,
  options?: { source?: CodingProblemSource },
): Promise<ProgrammingProblem[]> {
  if (!problems.length) return [];

  const source = options?.source ?? 'upload';
  const langTag = await ensureCodingTag(langTagSlug(defaultLanguage));
  const allTag = await ensureCodingTag(CODING_BANK_TAG_ALL);
  const uploadTag = source === 'upload' ? await ensureCodingTag(CODING_UPLOAD_TAG) : null;
  const created: ProgrammingProblem[] = [];

  for (const problem of problems) {
    const payload = buildCodingQuestionPayload(problem, defaultLanguage, source);
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

    const tagRows = [
      { questionId: row.id, tagId: langTag.id },
      { questionId: row.id, tagId: allTag.id },
    ];
    if (uploadTag) tagRows.push({ questionId: row.id, tagId: uploadTag.id });

    await prisma.questionTagLink.createMany({
      data: tagRows,
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

/** Java coding problems from uploaded documents only — excludes built-in Core 50 / array catalog. */
export async function loadUploadedCodingBank(options?: {
  language?: CodingBankLanguage;
  limit?: number;
}): Promise<ProgrammingProblem[]> {
  const language = options?.language ?? 'java';
  const tag = await prisma.questionTag.findUnique({ where: { slug: langTagSlug(language) } });
  if (!tag) return [];

  const links = await prisma.questionTagLink.findMany({
    where: { tagId: tag.id },
    select: { questionId: true },
  });
  const ids = links.map((l) => l.questionId);
  if (!ids.length) return [];

  const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 1000);
  const rows = await prisma.question.findMany({
    where: { id: { in: ids }, type: 'CODING' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const problems: ProgrammingProblem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const stored = parseStoredCodingProblem(row.explanation);
    if (!stored) continue;
    if (
      !isUploadedCodingProblem({
        storedId: stored.problem.id,
        title: stored.problem.title,
        source: stored.source,
        tags: row.tags,
      })
    ) {
      continue;
    }
    const key = stored.problem.title.trim().toLowerCase() || row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({ ...stored.problem, id: row.id, starterCode: undefined });
  }
  return problems;
}

export async function ensureCodingBankTags(): Promise<void> {
  await ensureCodingTag(CODING_BANK_TAG_ALL);
  await ensureCodingTag(CODING_BANK_TAG_C);
  await ensureCodingTag(CODING_BANK_TAG_PYTHON);
  await ensureCodingTag(CODING_BANK_TAG_JAVA);
  await ensureCodingTag(CODING_UPLOAD_TAG);
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
  const created = await insertCodingProblemsIntoBank(missing, 'java', { source: 'catalog' });
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
  const created = await insertCodingProblemsIntoBank(missing, 'java', { source: 'catalog' });
  return { inserted: created.length };
}
