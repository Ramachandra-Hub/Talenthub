import { prisma } from '@/lib/prisma';
import { DEFAULT_DSA_CONFIG } from '@/lib/dsa/types';
import {
  DSA_MCQS,
  DSA_PROBLEMS,
  DSA_PROGRAM_SLUG,
  DSA_TOPICS,
  DSA_WEEKS,
} from '@/lib/dsa/curriculum';

export async function ensureDsaCurriculum(): Promise<{ programId: string }> {
  const existing = await prisma.dsaProgram.findUnique({
    where: { slug: DSA_PROGRAM_SLUG },
    select: { id: true },
  });
  if (existing) {
    const problemCount = await prisma.dsaProblem.count();
    if (problemCount >= DSA_PROBLEMS.length) return { programId: existing.id };
  }

  const program = await prisma.dsaProgram.upsert({
    where: { slug: DSA_PROGRAM_SLUG },
    update: {
      title: 'DSA Level 1',
      description: 'Day-wise DSA practice. Complete each day to unlock the next.',
      daysPerWeek: 5,
      configJson: DEFAULT_DSA_CONFIG,
      isActive: true,
    },
    create: {
      slug: DSA_PROGRAM_SLUG,
      title: 'DSA Level 1',
      description: 'Day-wise DSA practice. Complete each day to unlock the next.',
      daysPerWeek: 5,
      configJson: DEFAULT_DSA_CONFIG,
      isActive: true,
    },
  });

  const level = await prisma.dsaLevel.upsert({
    where: { programId_slug: { programId: program.id, slug: 'level-1' } },
    update: { title: 'Level 1', sortOrder: 1 },
    create: {
      programId: program.id,
      slug: 'level-1',
      title: 'Level 1',
      sortOrder: 1,
    },
  });

  const topicIds = new Map<string, string>();
  for (const topic of DSA_TOPICS) {
    const row = await prisma.dsaTopic.upsert({
      where: { slug: topic.slug },
      update: { name: topic.name },
      create: { slug: topic.slug, name: topic.name },
    });
    topicIds.set(topic.slug, row.id);
  }

  for (const week of DSA_WEEKS) {
    const weekRow = await prisma.dsaWeek.upsert({
      where: { levelId_weekNumber: { levelId: level.id, weekNumber: week.weekNumber } },
      update: {
        title: week.title,
        topicSlug: week.topicSlug,
        topicName: week.topicName,
        sortOrder: week.weekNumber,
      },
      create: {
        levelId: level.id,
        weekNumber: week.weekNumber,
        title: week.title,
        topicSlug: week.topicSlug,
        topicName: week.topicName,
        sortOrder: week.weekNumber,
      },
    });
    const dayCount = program.daysPerWeek > 0 ? program.daysPerWeek : 5;
    for (let dayNumber = 1; dayNumber <= dayCount; dayNumber += 1) {
      await prisma.dsaDay.upsert({
        where: { weekId_dayNumber: { weekId: weekRow.id, dayNumber } },
        update: { title: `Day ${dayNumber}` },
        create: {
          weekId: weekRow.id,
          dayNumber,
          title: `Day ${dayNumber}`,
        },
      });
    }
  }

  for (const problem of DSA_PROBLEMS) {
    const topicId = topicIds.get(problem.topicSlug);
    if (!topicId) continue;
    await prisma.dsaProblem.upsert({
      where: { slug: problem.slug },
      update: {
        title: problem.title,
        statement: problem.statement,
        constraints: problem.constraints,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        examplesJson: problem.examples,
        topicId,
        conceptSlug: problem.conceptSlug,
        difficulty: problem.difficulty,
        expectedComplexity: problem.expectedComplexity,
        testCasesJson: problem.testCases,
        starterCodeJson: problem.starter,
        languagesJson: problem.languages,
        isActive: true,
      },
      create: {
        slug: problem.slug,
        title: problem.title,
        statement: problem.statement,
        constraints: problem.constraints,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        examplesJson: problem.examples,
        topicId,
        conceptSlug: problem.conceptSlug,
        difficulty: problem.difficulty,
        expectedComplexity: problem.expectedComplexity,
        testCasesJson: problem.testCases,
        starterCodeJson: problem.starter,
        languagesJson: problem.languages,
        isActive: true,
      },
    });
  }

  for (const mcq of DSA_MCQS) {
    const topicId = topicIds.get(mcq.topicSlug);
    if (!topicId) continue;
    await prisma.dsaMcq.upsert({
      where: { slug: mcq.slug },
      update: {
        topicId,
        conceptSlug: mcq.conceptSlug,
        problemSlug: mcq.problemSlug ?? null,
        questionText: mcq.questionText,
        optionA: mcq.optionA,
        optionB: mcq.optionB,
        optionC: mcq.optionC,
        optionD: mcq.optionD,
        correctAnswer: mcq.correctAnswer,
        explanation: mcq.explanation,
        difficulty: mcq.difficulty,
        isActive: true,
      },
      create: {
        slug: mcq.slug,
        topicId,
        conceptSlug: mcq.conceptSlug,
        problemSlug: mcq.problemSlug ?? null,
        questionText: mcq.questionText,
        optionA: mcq.optionA,
        optionB: mcq.optionB,
        optionC: mcq.optionC,
        optionD: mcq.optionD,
        correctAnswer: mcq.correctAnswer,
        explanation: mcq.explanation,
        difficulty: mcq.difficulty,
        isActive: true,
      },
    });
  }

  return { programId: program.id };
}
