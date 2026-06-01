import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { allSyllabusTagDefs, CURATED_BANK_MARKER } from '@/lib/question-bank/curated-mcqs';
import {
  DEFAULT_SYLLABUS_QUESTIONS_PER_TOPIC,
  generateSyllabusMcqsForSlug,
  MAX_SYLLABUS_QUESTIONS_PER_TOPIC,
} from '@/lib/question-bank/syllabus-mcq-generator';
import type { SeedCuratedBankResult } from '@/lib/question-bank/seed-curated-bank';

const INSERT_BATCH = 40;

async function upsertTagPrisma(def: { slug: string; name: string }) {
  const existing = await prisma.questionTag.findUnique({ where: { slug: def.slug } });
  if (existing) return existing;
  return prisma.questionTag.create({ data: { name: def.name, slug: def.slug } });
}

export async function seedCuratedQuestionBankPrisma(options?: {
  questionsPerTopic?: number;
  replaceExisting?: boolean;
}): Promise<SeedCuratedBankResult> {
  const questionsPerTopic = Math.min(
    MAX_SYLLABUS_QUESTIONS_PER_TOPIC,
    Math.max(10, options?.questionsPerTopic ?? DEFAULT_SYLLABUS_QUESTIONS_PER_TOPIC),
  );
  const warnings: string[] = [];
  const perTopic: SeedCuratedBankResult['perTopic'] = [];

  if (options?.replaceExisting !== false) {
    const curatedRows = await prisma.question.findMany({
      select: { id: true, tags: true },
      take: 50_000,
    });
    const curatedIds = curatedRows
      .filter((row) => {
        const tags = row.tags;
        return Array.isArray(tags) && tags.includes(CURATED_BANK_MARKER);
      })
      .map((row) => row.id);
    if (curatedIds.length > 0) {
      await prisma.questionTagLink.deleteMany({
        where: { questionId: { in: curatedIds } },
      });
      await prisma.question.deleteMany({
        where: { id: { in: curatedIds } },
      });
    }
  }

  const defs = allSyllabusTagDefs();
  let tagsEnsured = 0;
  let questionsInserted = 0;
  let linksCreated = 0;

  for (const def of defs) {
    const tag = await upsertTagPrisma(def);
    if (!tag) {
      warnings.push(`Could not ensure tag for ${def.slug}`);
      continue;
    }
    tagsEnsured += 1;

    const mcqs = generateSyllabusMcqsForSlug(def.slug, def.name, questionsPerTopic);
    let topicInserted = 0;

    for (let i = 0; i < mcqs.length; i += INSERT_BATCH) {
      const batch = mcqs.slice(i, i + INSERT_BATCH);
      for (const q of batch) {
        const created = await prisma.question.create({
          data: {
            questionText: q.question,
            questionType: 'MCQ',
            type: 'MCQ',
            difficulty: q.difficulty ?? 'medium',
            optionA: q.options[0],
            optionB: q.options[1],
            optionC: q.options[2],
            optionD: q.options[3],
            options: q.options as Prisma.InputJsonValue,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation ?? null,
            tags: [CURATED_BANK_MARKER, tag.slug] as Prisma.InputJsonValue,
            marks: 1,
          },
          select: { id: true },
        });

        await prisma.questionTagLink.create({
          data: { questionId: created.id, tagId: tag.id },
        });

        topicInserted += 1;
        questionsInserted += 1;
        linksCreated += 1;
      }
    }

    perTopic.push({ slug: def.slug, name: def.name, inserted: topicInserted });
  }

  return { tagsEnsured, questionsInserted, linksCreated, perTopic, warnings };
}

/** Ensure each slug has at least `minQuestions` MCQs (insert only; never deletes). */
export async function ensureSyllabusBankForSlugs(
  slugs: string[],
  minQuestions: number,
): Promise<{ inserted: number; slugs: string[] }> {
  const target = Math.min(
    MAX_SYLLABUS_QUESTIONS_PER_TOPIC,
    Math.max(5, minQuestions),
  );
  const defs = allSyllabusTagDefs().filter((d) => slugs.includes(d.slug));
  let inserted = 0;
  const touched: string[] = [];

  for (const def of defs) {
    const tag = await upsertTagPrisma(def);
    if (!tag) continue;

    const existing = await prisma.questionTagLink.count({ where: { tagId: tag.id } });
    if (existing >= target) continue;

    const need = target - existing;
    const mcqs = generateSyllabusMcqsForSlug(def.slug, def.name, need);
    touched.push(def.slug);

    for (const q of mcqs) {
      const created = await prisma.question.create({
        data: {
          questionText: q.question,
          questionType: 'MCQ',
          type: 'MCQ',
          difficulty: q.difficulty ?? 'medium',
          optionA: q.options[0],
          optionB: q.options[1],
          optionC: q.options[2],
          optionD: q.options[3],
          options: q.options as Prisma.InputJsonValue,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation ?? null,
          tags: [CURATED_BANK_MARKER, tag.slug] as Prisma.InputJsonValue,
          marks: 1,
        },
        select: { id: true },
      });
      await prisma.questionTagLink.create({
        data: { questionId: created.id, tagId: tag.id },
      });
      inserted += 1;
    }
  }

  return { inserted, slugs: touched };
}
