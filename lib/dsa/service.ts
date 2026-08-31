import { prisma } from '@/lib/prisma';
import { ensureDsaCurriculum } from '@/lib/dsa/ensure-curriculum';
import { parseProgramConfig } from '@/lib/dsa/parse-config';
import { assignItemsWithoutRepeat } from '@/lib/dsa/assign';
import { evaluateDayCompletion, evaluateWeekQualification } from '@/lib/dsa/policy';
import { gradeDsaSource, parseTestCases } from '@/lib/dsa/grade';
import { writeDsaAudit } from '@/lib/dsa/audit';
import { Prisma } from '@prisma/client';
import { isCodingLanguageId } from '@/lib/coding/languages';
import type { DsaAttemptKind, DsaDayState, DsaDifficulty, DsaProgramConfig } from '@/lib/dsa/types';

function asDifficulty(value: string): DsaDifficulty {
  if (value === 'easy' || value === 'advanced') return value;
  return 'medium';
}

async function loadProgramBundle() {
  const { programId } = await ensureDsaCurriculum();
  const program = await prisma.dsaProgram.findUniqueOrThrow({
    where: { id: programId },
    include: {
      levels: {
        orderBy: { sortOrder: 'asc' },
        include: {
          weeks: {
            orderBy: { sortOrder: 'asc' },
            include: { days: { orderBy: { dayNumber: 'asc' } } },
          },
        },
      },
    },
  });
  return { program, config: parseProgramConfig(program.configJson) };
}

async function enrollStudent(userId: string, programId: string) {
  return prisma.dsaEnrollment.upsert({
    where: { userId_programId: { userId, programId } },
    update: { status: 'active' },
    create: { userId, programId, status: 'active' },
  });
}

async function officialUsedProblemIds(enrollmentId: string): Promise<Set<string>> {
  const attempts = await prisma.dsaWeekAttempt.findMany({
    where: { enrollmentId, kind: 'official' },
    select: { id: true },
  });
  const ids = attempts.map((a) => a.id);
  if (!ids.length) return new Set();
  const rows = await prisma.dsaDayAssignment.findMany({
    where: { dayProgress: { weekAttemptId: { in: ids } }, problemId: { not: null } },
    select: { problemId: true },
  });
  return new Set(rows.map((r) => r.problemId).filter((id): id is string => Boolean(id)));
}

async function officialUsedMcqIds(enrollmentId: string): Promise<Set<string>> {
  const attempts = await prisma.dsaWeekAttempt.findMany({
    where: { enrollmentId, kind: 'official' },
    select: { id: true },
  });
  const ids = attempts.map((a) => a.id);
  if (!ids.length) return new Set();
  const rows = await prisma.dsaDayAssignment.findMany({
    where: { dayProgress: { weekAttemptId: { in: ids } }, mcqId: { not: null } },
    select: { mcqId: true },
  });
  return new Set(rows.map((r) => r.mcqId).filter((id): id is string => Boolean(id)));
}

async function createWeekAttempt(input: {
  enrollmentId: string;
  weekId: string;
  kind: DsaAttemptKind;
  config: DsaProgramConfig;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
    const last = await tx.dsaWeekAttempt.findFirst({
      where: { enrollmentId: input.enrollmentId, weekId: input.weekId, kind: input.kind },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (last?.attemptNumber ?? 0) + 1;
    const attempt = await tx.dsaWeekAttempt.create({
      data: {
        enrollmentId: input.enrollmentId,
        weekId: input.weekId,
        attemptNumber,
        kind: input.kind,
        isActive: true,
        status: 'in_progress',
      },
    });
    const days = await tx.dsaDay.findMany({
      where: { weekId: input.weekId },
      orderBy: { dayNumber: 'asc' },
    });
    for (const day of days) {
      await tx.dsaDayProgress.create({
        data: {
          weekAttemptId: attempt.id,
          dayId: day.id,
          status: day.dayNumber === 1 ? 'available' : 'locked',
        },
      });
    }
    return attempt;
  });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.dsaWeekAttempt.findFirst({
        where: {
          enrollmentId: input.enrollmentId,
          weekId: input.weekId,
          kind: input.kind,
          isActive: true,
        },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

async function getOrCreateOfficialAttempt(enrollmentId: string, weekId: string, config: DsaProgramConfig) {
  const active = await prisma.dsaWeekAttempt.findFirst({
    where: { enrollmentId, weekId, kind: 'official', isActive: true },
  });
  if (active) return active;
  const passed = await prisma.dsaWeekAttempt.findFirst({
    where: { enrollmentId, weekId, kind: 'official', status: 'completed' },
    orderBy: { attemptNumber: 'desc' },
  });
  if (passed) return passed;
  return createWeekAttempt({ enrollmentId, weekId, kind: 'official', config });
}

async function assignDayTasks(input: {
  userId: string;
  enrollmentId: string;
  weekAttemptId: string;
  dayProgressId: string;
  weekTopicSlug: string;
  config: DsaProgramConfig;
  kind: DsaAttemptKind;
}) {
  const existing = await prisma.dsaDayAssignment.count({ where: { dayProgressId: input.dayProgressId } });
  if (existing) return;

  const problems = await prisma.dsaProblem.findMany({
    where: { isActive: true, topic: { slug: input.weekTopicSlug } },
    include: { topic: { select: { slug: true } } },
  });
  const mcqs = await prisma.dsaMcq.findMany({
    where: { isActive: true, topic: { slug: input.weekTopicSlug } },
    include: { topic: { select: { slug: true } } },
  });

  const usedProblems =
    input.kind === 'official' ? await officialUsedProblemIds(input.enrollmentId) : new Set<string>();
  const usedMcqs =
    input.kind === 'official' ? await officialUsedMcqIds(input.enrollmentId) : new Set<string>();

  const pickedProblems = assignItemsWithoutRepeat({
    pool: problems.map((p) => ({
      id: p.id,
      difficulty: asDifficulty(p.difficulty),
      topicSlug: p.topic.slug,
    })),
    usedIds: usedProblems,
    count: input.config.codingProblemsPerDay,
    mix: input.config.difficultyMix,
    seed: `${input.userId}:${input.weekAttemptId}:${input.dayProgressId}:coding`,
    topicSlug: input.weekTopicSlug,
  });
  const pickedMcqs = assignItemsWithoutRepeat({
    pool: mcqs.map((m) => ({
      id: m.id,
      difficulty: asDifficulty(m.difficulty),
      topicSlug: m.topic.slug,
    })),
    usedIds: usedMcqs,
    count: input.config.mcqsPerDay,
    mix: input.config.difficultyMix,
    seed: `${input.userId}:${input.weekAttemptId}:${input.dayProgressId}:mcq`,
    topicSlug: input.weekTopicSlug,
  });

  let order = 1;
  await prisma.dsaDayAssignment.createMany({
    data: [
      ...pickedProblems.map((p) => ({
        dayProgressId: input.dayProgressId,
        kind: 'coding',
        problemId: p.id,
        sortOrder: order++,
      })),
      ...pickedMcqs.map((m) => ({
        dayProgressId: input.dayProgressId,
        kind: 'mcq',
        mcqId: m.id,
        sortOrder: order++,
      })),
    ],
  });
}

function assertOwnsAttempt(userId: string, enrollmentUserId: string) {
  if (userId !== enrollmentUserId) {
    const err = new Error('Forbidden');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export async function getDsaDashboard(userId: string) {
  const { program, config } = await loadProgramBundle();
  const enrollment = await enrollStudent(userId, program.id);
  const level = program.levels[0];
  if (!level) throw new Error('DSA curriculum has no levels');

  const weeks = [];
  let previousOfficialCompleted = true;
  for (const week of level.weeks) {
    if (!previousOfficialCompleted) {
      weeks.push({
        id: week.id,
        weekNumber: week.weekNumber,
        title: week.title,
        topicName: week.topicName,
        topicSlug: week.topicSlug,
        status: 'locked',
        attemptNumber: 0,
        daysCompleted: 0,
        daysTotal: week.days.length,
        progressPercent: 0,
        qualificationStatus: 'not_eligible',
        failedAttempts: 0,
        currentDay: null,
        lockReason: `Complete Week ${week.weekNumber - 1} to unlock ${week.title}.`,
        days: week.days.map((d) => ({
          id: d.id,
          dayNumber: d.dayNumber,
          title: d.title,
          status: 'locked' as DsaDayState,
          lockReason: `Complete Week ${week.weekNumber - 1} first.`,
        })),
      });
      continue;
    }
    const attempt = await getOrCreateOfficialAttempt(enrollment.id, week.id, config);
    const days = await prisma.dsaDayProgress.findMany({
      where: { weekAttemptId: attempt.id },
      include: { day: true },
      orderBy: { day: { dayNumber: 'asc' } },
    });
    const completedDays = days.filter((d) => d.status === 'completed').length;
    const qualification = await prisma.dsaQualification.findFirst({
      where: { enrollmentId: enrollment.id, weekAttempt: { weekId: week.id, kind: 'official', status: 'completed' } },
      orderBy: { createdAt: 'desc' },
    });
    const failedCount = await prisma.dsaWeekAttempt.count({
      where: { enrollmentId: enrollment.id, weekId: week.id, kind: 'official', status: 'failed' },
    });
    weeks.push({
      id: week.id,
      weekNumber: week.weekNumber,
      title: week.title,
      topicName: week.topicName,
      topicSlug: week.topicSlug,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      daysCompleted: completedDays,
      daysTotal: days.length,
      progressPercent: days.length ? Math.round((completedDays / days.length) * 100) : 0,
      qualificationStatus: qualification ? 'qualified' : attempt.status === 'completed' ? 'qualified' : completedDays >= days.length ? 'eligible' : 'not_eligible',
      failedAttempts: failedCount,
      currentDay: days.find((d) => d.status === 'in_progress' || d.status === 'available')?.day.dayNumber ?? null,
      days: days.map((d) => ({
        id: d.dayId,
        dayNumber: d.day.dayNumber,
        title: d.day.title,
        status: d.status as DsaDayState,
        lockReason:
          d.status === 'locked'
            ? `Complete Day ${d.day.dayNumber - 1} successfully to unlock Day ${d.day.dayNumber}.`
            : null,
      })),
    });
    previousOfficialCompleted = attempt.status === 'completed';
  }

  const current = weeks.find((w) => w.status === 'in_progress') ?? weeks[0];
  return {
    program: { id: program.id, title: program.title, daysPerWeek: program.daysPerWeek },
    level: { id: level.id, title: level.title },
    config: {
      supportedLanguages: config.supportedLanguages,
      defaultLanguage: config.defaultLanguage,
    },
    currentWeek: current,
    weeks,
  };
}

export async function getDsaDay(userId: string, dayId: string, kind: DsaAttemptKind = 'official') {
  const { program, config } = await loadProgramBundle();
  const enrollment = await enrollStudent(userId, program.id);
  const day = await prisma.dsaDay.findUnique({
    where: { id: dayId },
    include: { week: { include: { level: { include: { weeks: true } } } } },
  });
  if (!day) {
    const err = new Error('Day not found');
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  if (kind === 'official' && day.week.weekNumber > 1) {
    const prev = day.week.level.weeks.find((w) => w.weekNumber === day.week.weekNumber - 1);
    if (prev) {
      const prevDone = await prisma.dsaWeekAttempt.findFirst({
        where: { enrollmentId: enrollment.id, weekId: prev.id, kind: 'official', status: 'completed' },
      });
      if (!prevDone) {
        const err = new Error(`Complete Week ${prev.weekNumber} before opening this week.`);
        (err as Error & { status: number }).status = 403;
        throw err;
      }
    }
  }

  const attempt = await prisma.dsaWeekAttempt.findFirst({
    where: { enrollmentId: enrollment.id, weekId: day.weekId, kind, isActive: true },
  });
  if (!attempt) {
    const err = new Error(
      kind === 'practice'
        ? 'Start practice for this week first.'
        : 'No active attempt for this week.',
    );
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const progress = await prisma.dsaDayProgress.findUnique({
    where: { weekAttemptId_dayId: { weekAttemptId: attempt.id, dayId } },
  });
  if (!progress) {
    const err = new Error('Day is not part of this attempt');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  if (progress.status === 'locked') {
    return {
      locked: true as const,
      day: { id: day.id, dayNumber: day.dayNumber, title: day.title },
      week: { id: day.week.id, title: day.week.title, topicName: day.week.topicName },
      status: progress.status,
      lockReason: `Complete Day ${day.dayNumber - 1} successfully to unlock Day ${day.dayNumber}.`,
    };
  }

  if (progress.status === 'available') {
    await prisma.dsaDayProgress.update({
      where: { id: progress.id },
      data: { status: 'in_progress', startedAt: progress.startedAt ?? new Date() },
    });
    await writeDsaAudit(userId, 'day_started', {
      dayId,
      weekAttemptId: attempt.id,
      kind,
    });
  }

  await assignDayTasks({
    userId,
    enrollmentId: enrollment.id,
    weekAttemptId: attempt.id,
    dayProgressId: progress.id,
    weekTopicSlug: day.week.topicSlug,
    config,
    kind,
  });

  const assignments = await prisma.dsaDayAssignment.findMany({
    where: { dayProgressId: progress.id },
    orderBy: { sortOrder: 'asc' },
    include: {
      problem: { include: { topic: true } },
      mcq: { include: { topic: true } },
    },
  });

  const codingIds = assignments.map((a) => a.problemId).filter((id): id is string => Boolean(id));
  const mcqIds = assignments.map((a) => a.mcqId).filter((id): id is string => Boolean(id));

  const bestCoding = codingIds.length
    ? await prisma.dsaCodeSubmission.findMany({
        where: { weekAttemptId: attempt.id, problemId: { in: codingIds }, userId },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const mcqLatest = mcqIds.length
    ? await prisma.dsaMcqAttempt.findMany({
        where: { weekAttemptId: attempt.id, mcqId: { in: mcqIds }, userId },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const latestMcqById = new Map<string, (typeof mcqLatest)[number]>();
  for (const row of mcqLatest) {
    if (!latestMcqById.has(row.mcqId)) latestMcqById.set(row.mcqId, row);
  }
  const bestByProblem = new Map<string, (typeof bestCoding)[number]>();
  for (const row of bestCoding) {
    const prev = bestByProblem.get(row.problemId);
    if (!prev || Number(row.scorePercent) > Number(prev.scorePercent)) {
      bestByProblem.set(row.problemId, row);
    }
  }

  const live = await prisma.dsaDayProgress.findUniqueOrThrow({ where: { id: progress.id } });

  return {
    locked: false as const,
    kind,
    status: live.status,
    weekAttemptId: attempt.id,
    week: {
      id: day.week.id,
      title: day.week.title,
      topicName: day.week.topicName,
      topicSlug: day.week.topicSlug,
    },
    day: { id: day.id, dayNumber: day.dayNumber, title: day.title },
    config: {
      supportedLanguages: config.supportedLanguages,
      defaultLanguage: config.defaultLanguage,
      dayCompletion: config.dayCompletion,
    },
    problems: assignments
      .filter((a) => a.problem)
      .map((a) => {
        const p = a.problem!;
        const cases = parseTestCases(p.testCasesJson);
        const best = bestByProblem.get(p.id);
        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          statement: p.statement,
          constraints: p.constraints,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          examples: p.examplesJson,
          topic: p.topic.name,
          conceptSlug: p.conceptSlug,
          difficulty: p.difficulty,
          expectedComplexity: p.expectedComplexity,
          hints: p.hintsJson,
          languages: p.languagesJson,
          starterCode: p.starterCodeJson,
          sampleTests: cases.filter((c) => !c.hidden).map((c) => ({
            input: c.input,
            expectedOutput: c.expectedOutput,
          })),
          hiddenTestCount: cases.filter((c) => c.hidden).length,
          best: best
            ? {
                passed: best.passed,
                total: best.total,
                scorePercent: Number(best.scorePercent),
                status: best.status,
                language: best.language,
              }
            : null,
        };
      }),
    mcqs: assignments
      .filter((a) => a.mcq)
      .map((a) => {
        const m = a.mcq!;
        const latest = latestMcqById.get(m.id);
        return {
          id: m.id,
          questionText: m.questionText,
          optionA: m.optionA,
          optionB: m.optionB,
          optionC: m.optionC,
          optionD: m.optionD,
          conceptSlug: m.conceptSlug,
          difficulty: m.difficulty,
          selected: latest?.selected ?? null,
          isCorrect: latest ? latest.isCorrect : null,
          explanation: latest ? m.explanation : null,
        };
      }),
  };
}

export async function submitDsaMcq(input: {
  userId: string;
  mcqId: string;
  selected: string;
  kind?: DsaAttemptKind;
}) {
  const { program } = await loadProgramBundle();
  const enrollment = await enrollStudent(input.userId, program.id);
  const selected = input.selected.trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(selected)) {
    const err = new Error('Select A, B, C or D');
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  const assignment = await prisma.dsaDayAssignment.findFirst({
    where: {
      mcqId: input.mcqId,
      dayProgress: {
        weekAttempt: {
          enrollmentId: enrollment.id,
          isActive: true,
        },
      },
    },
    include: {
      dayProgress: {
        include: {
          weekAttempt: { include: { enrollment: true } },
        },
      },
      mcq: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!assignment?.mcq || !assignment.dayProgress) {
    const err = new Error('MCQ is not assigned');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const attempt = assignment.dayProgress.weekAttempt;
  assertOwnsAttempt(input.userId, attempt.enrollment.userId);
  if (!attempt.isActive) {
    const err = new Error('This attempt is closed');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  if (assignment.dayProgress.status === 'locked') {
    const err = new Error('Day is locked');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const isCorrect = selected === assignment.mcq.correctAnswer.trim().toUpperCase();
  const row = await prisma.dsaMcqAttempt.create({
    data: {
      userId: input.userId,
      weekAttemptId: attempt.id,
      mcqId: assignment.mcq.id,
      selected,
      isCorrect,
      kind: attempt.kind,
    },
  });
  return {
    attemptId: row.id,
    isCorrect,
    explanation: assignment.mcq.explanation,
    correctAnswer: isCorrect ? undefined : undefined,
  };
}

export async function submitDsaCode(input: {
  userId: string;
  problemId: string;
  language: string;
  sourceCode: string;
}) {
  if (!input.sourceCode.trim()) {
    const err = new Error('Source code is required');
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  const language = isCodingLanguageId(input.language) ? input.language : null;
  if (!language) {
    const err = new Error('Unsupported language');
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  const { program } = await loadProgramBundle();
  const enrollment = await enrollStudent(input.userId, program.id);
  const assignment = await prisma.dsaDayAssignment.findFirst({
    where: {
      problemId: input.problemId,
      dayProgress: {
        weekAttempt: {
          enrollmentId: enrollment.id,
          isActive: true,
        },
      },
    },
    include: {
      problem: true,
      dayProgress: { include: { weekAttempt: { include: { enrollment: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!assignment?.problem || !assignment.dayProgress) {
    const err = new Error('Problem is not assigned');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const allowedLanguages = Array.isArray(assignment.problem.languagesJson)
    ? assignment.problem.languagesJson.map(String)
    : [];
  if (allowedLanguages.length && !allowedLanguages.includes(language)) {
    const err = new Error('This problem does not support that language');
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  const attempt = assignment.dayProgress.weekAttempt;
  assertOwnsAttempt(input.userId, attempt.enrollment.userId);
  if (!attempt.isActive || assignment.dayProgress.status === 'locked') {
    const err = new Error('You cannot submit on a locked or closed attempt');
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const cases = parseTestCases(assignment.problem.testCasesJson);
  const grade = await gradeDsaSource({
    language,
    sourceCode: input.sourceCode,
    testCases: cases,
  });
  const passedAll = grade.total > 0 && grade.passed === grade.total;
  const row = await prisma.dsaCodeSubmission.create({
    data: {
      userId: input.userId,
      weekAttemptId: attempt.id,
      problemId: assignment.problem.id,
      language,
      sourceCode: input.sourceCode,
      passed: grade.passed,
      total: grade.total,
      scorePercent: Math.round(grade.fraction * 10000) / 100,
      status: passedAll ? 'passed' : 'failed',
      stdout: grade.stdout.slice(0, 4000),
      stderr: grade.stderr.slice(0, 4000),
      runtimeMs: grade.runtimeMs,
      kind: attempt.kind,
    },
  });
  await writeDsaAudit(input.userId, 'code_submitted', {
    submissionId: row.id,
    problemId: assignment.problem.id,
    language,
    passed: grade.passed,
    total: grade.total,
    weekAttemptId: attempt.id,
  });
  return {
    submissionId: row.id,
    passed: grade.passed,
    total: grade.total,
    scorePercent: Number(row.scorePercent),
    status: row.status,
    compileOk: grade.compileOk,
    publicResults: grade.publicResults,
    language,
  };
}

export async function completeDsaDay(userId: string, dayId: string) {
  const { program, config } = await loadProgramBundle();
  const enrollment = await enrollStudent(userId, program.id);
  const progressInclude = {
    assignments: true,
    weekAttempt: true,
    day: { include: { week: { include: { days: { orderBy: { dayNumber: 'asc' as const } } } } } },
  };
  let progress = await prisma.dsaDayProgress.findFirst({
    where: {
      dayId,
      weekAttempt: { enrollmentId: enrollment.id, isActive: true },
      status: { in: ['available', 'in_progress'] },
    },
    include: progressInclude,
    orderBy: { startedAt: 'desc' },
  });
  if (!progress) {
    const done = await prisma.dsaDayProgress.findFirst({
      where: {
        dayId,
        weekAttempt: { enrollmentId: enrollment.id },
        status: 'completed',
      },
    });
    if (done) return { ok: true, alreadyCompleted: true };
    const err = new Error('Day is locked');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const attempt = progress.weekAttempt;
  const day = progress.day;

  const problemIds = progress.assignments.map((a) => a.problemId).filter((id): id is string => Boolean(id));
  const mcqIds = progress.assignments.map((a) => a.mcqId).filter((id): id is string => Boolean(id));
  const submissions = problemIds.length
    ? await prisma.dsaCodeSubmission.findMany({
        where: { weekAttemptId: attempt.id, problemId: { in: problemIds }, userId },
      })
    : [];
  const mcqAttempts = mcqIds.length
    ? await prisma.dsaMcqAttempt.findMany({
        where: { weekAttemptId: attempt.id, mcqId: { in: mcqIds }, userId },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const latestMcq = new Map<string, (typeof mcqAttempts)[number]>();
  for (const row of mcqAttempts) {
    if (!latestMcq.has(row.mcqId)) latestMcq.set(row.mcqId, row);
  }
  const codingSolved = problemIds.filter((id) =>
    submissions.some((s) => s.problemId === id && s.status === 'passed'),
  ).length;
  const bestFraction = problemIds.reduce((max, id) => {
    const best = submissions
      .filter((s) => s.problemId === id)
      .reduce((m, s) => Math.max(m, s.total > 0 ? s.passed / s.total : 0), 0);
    return Math.max(max, best);
  }, 0);
  const mcqAttempted = latestMcq.size;
  const mcqCorrect = [...latestMcq.values()].filter((r) => r.isCorrect).length;
  const verdict = evaluateDayCompletion({
    policy: config.dayCompletion,
    codingSolved,
    codingBestFraction: bestFraction,
    mcqAttempted,
    mcqCorrect,
  });
  if (!verdict.passed) {
    await prisma.dsaDayProgress.update({
      where: { id: progress.id },
      data: {
        status: 'in_progress',
        codingSolved,
        mcqPercent: mcqAttempted ? (mcqCorrect / mcqAttempted) * 100 : 0,
        failReason: verdict.reasons.join(' '),
      },
    });
    return { ok: false, reasons: verdict.reasons };
  }

  const nextDay = day.week.days.find((d) => d.dayNumber === day.dayNumber + 1);
  await prisma.$transaction(async (tx) => {
    await tx.dsaDayProgress.update({
      where: { id: progress.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        codingSolved,
        mcqPercent: mcqAttempted ? (mcqCorrect / mcqAttempted) * 100 : 0,
        failReason: null,
      },
    });
    if (nextDay) {
      const next = await tx.dsaDayProgress.findUnique({
        where: { weekAttemptId_dayId: { weekAttemptId: attempt.id, dayId: nextDay.id } },
      });
      if (next && next.status === 'locked') {
        await tx.dsaDayProgress.update({
          where: { id: next.id },
          data: { status: 'available' },
        });
      }
    }
  });
  await writeDsaAudit(userId, 'day_completed', { dayId, weekAttemptId: attempt.id });
  return { ok: true, unlockedDayId: nextDay?.id ?? null, nextDayNumber: nextDay?.dayNumber ?? null };
}

export async function submitWeeklyAssessment(input: {
  userId: string;
  weekId: string;
  answers: Record<string, string>;
}) {
  const { program, config } = await loadProgramBundle();
  const enrollment = await enrollStudent(input.userId, program.id);
  const week = await prisma.dsaWeek.findUnique({
    where: { id: input.weekId },
    include: { days: true },
  });
  if (!week) {
    const err = new Error('Week not found');
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  const attempt = await prisma.dsaWeekAttempt.findFirst({
    where: { enrollmentId: enrollment.id, weekId: week.id, kind: 'official', isActive: true },
  });
  if (!attempt) {
    const err = new Error('No active official attempt');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const days = await prisma.dsaDayProgress.findMany({ where: { weekAttemptId: attempt.id } });
  const completed = days.filter((d) => d.status === 'completed').length;
  if (completed < days.length) {
    const err = new Error('Complete every day before the weekly assessment');
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const assignedMcqIds = (
    await prisma.dsaDayAssignment.findMany({
      where: { dayProgress: { weekAttemptId: attempt.id }, mcqId: { not: null } },
      select: { mcqId: true },
    })
  )
    .map((r) => r.mcqId)
    .filter((id): id is string => Boolean(id));

  const pool = await prisma.dsaMcq.findMany({
    where: { isActive: true, topic: { slug: week.topicSlug }, id: { notIn: assignedMcqIds } },
  });
  const quiz = pool.slice(0, config.weeklyAssessmentMcqs);
  const fallback = quiz.length
    ? quiz
    : await prisma.dsaMcq.findMany({
        where: { isActive: true, topic: { slug: week.topicSlug } },
        take: config.weeklyAssessmentMcqs,
      });

  let correct = 0;
  for (const mcq of fallback) {
    const selected = String(input.answers[mcq.id] ?? '').trim().toUpperCase();
    const ok = selected === mcq.correctAnswer.trim().toUpperCase();
    if (ok) correct += 1;
    await prisma.dsaMcqAttempt.create({
      data: {
        userId: input.userId,
        weekAttemptId: attempt.id,
        mcqId: mcq.id,
        selected: selected || '-',
        isCorrect: ok,
        kind: 'official',
      },
    });
  }
  const percent = fallback.length ? (correct / fallback.length) * 100 : 0;
  const verdict = evaluateWeekQualification({
    policy: config.weekQualification,
    daysCompleted: completed,
    daysRequired: days.length,
    assessmentPercent: percent,
  });

  if (!verdict.passed) {
    await prisma.dsaWeekAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'failed',
        isActive: false,
        assessmentPercent: percent,
        completedAt: new Date(),
      },
    });
    await writeDsaAudit(input.userId, 'week_failed', {
      weekId: week.id,
      attemptId: attempt.id,
      percent,
    });
    const next = await createWeekAttempt({
      enrollmentId: enrollment.id,
      weekId: week.id,
      kind: 'official',
      config,
    });
    await writeDsaAudit(input.userId, 'week_reset', {
      weekId: week.id,
      previousAttemptId: attempt.id,
      newAttemptId: next.id,
      attemptNumber: next.attemptNumber,
    });
    return {
      passed: false,
      percent,
      reasons: verdict.reasons,
      newAttemptNumber: next.attemptNumber,
      qualification: 'not_eligible' as const,
    };
  }

  await prisma.dsaWeekAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'completed',
      assessmentPercent: percent,
      completedAt: new Date(),
    },
  });
  await prisma.dsaQualification.upsert({
    where: {
      enrollmentId_weekAttemptId: { enrollmentId: enrollment.id, weekAttemptId: attempt.id },
    },
    update: { status: 'qualified' },
    create: {
      enrollmentId: enrollment.id,
      weekAttemptId: attempt.id,
      title: `DSA ${week.title} Assignment Attendance`,
      source: 'weekly_dsa_completion',
      status: 'qualified',
    },
  });
  await writeDsaAudit(input.userId, 'week_passed', { weekId: week.id, attemptId: attempt.id, percent });
  await writeDsaAudit(input.userId, 'qualification_granted', {
    weekId: week.id,
    attemptId: attempt.id,
  });
  return {
    passed: true,
    percent,
    reasons: [],
    qualification: 'qualified' as const,
    title: `DSA ${week.title} Assignment Attendance`,
  };
}

export async function getWeeklyAssessmentPaper(userId: string, weekId: string) {
  const { program, config } = await loadProgramBundle();
  const enrollment = await enrollStudent(userId, program.id);
  const week = await prisma.dsaWeek.findUnique({ where: { id: weekId } });
  if (!week) {
    const err = new Error('Week not found');
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  const attempt = await prisma.dsaWeekAttempt.findFirst({
    where: { enrollmentId: enrollment.id, weekId, kind: 'official', isActive: true },
  });
  if (!attempt) {
    const err = new Error('No active attempt');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const days = await prisma.dsaDayProgress.findMany({ where: { weekAttemptId: attempt.id } });
  if (days.some((d) => d.status !== 'completed')) {
    const err = new Error('Complete every day before the weekly assessment');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const assignedMcqIds = (
    await prisma.dsaDayAssignment.findMany({
      where: { dayProgress: { weekAttemptId: attempt.id }, mcqId: { not: null } },
      select: { mcqId: true },
    })
  )
    .map((r) => r.mcqId)
    .filter((id): id is string => Boolean(id));
  let quiz = await prisma.dsaMcq.findMany({
    where: { isActive: true, topic: { slug: week.topicSlug }, id: { notIn: assignedMcqIds } },
    take: config.weeklyAssessmentMcqs,
  });
  if (quiz.length < config.weeklyAssessmentMcqs) {
    quiz = await prisma.dsaMcq.findMany({
      where: { isActive: true, topic: { slug: week.topicSlug } },
      take: config.weeklyAssessmentMcqs,
    });
  }
  return {
    week: { id: week.id, title: week.title },
    minPercent: config.weekQualification.weeklyAssessmentMinPercent,
    mcqs: quiz.map((m) => ({
      id: m.id,
      questionText: m.questionText,
      optionA: m.optionA,
      optionB: m.optionB,
      optionC: m.optionC,
      optionD: m.optionD,
    })),
  };
}

export async function startPracticeWeek(userId: string, weekId: string) {
  const { program, config } = await loadProgramBundle();
  const enrollment = await enrollStudent(userId, program.id);
  const official = await prisma.dsaWeekAttempt.findFirst({
    where: { enrollmentId: enrollment.id, weekId, kind: 'official', status: 'completed' },
  });
  if (!official) {
    const err = new Error('Practice unlocks after you officially complete this week');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  await prisma.dsaWeekAttempt.updateMany({
    where: { enrollmentId: enrollment.id, weekId, kind: 'practice', isActive: true },
    data: { isActive: false },
  });
  const attempt = await createWeekAttempt({
    enrollmentId: enrollment.id,
    weekId,
    kind: 'practice',
    config,
  });
  await writeDsaAudit(userId, 'practice_started', { weekId, attemptId: attempt.id });
  const first = await prisma.dsaDay.findFirst({
    where: { weekId, dayNumber: 1 },
    select: { id: true },
  });
  return { attemptId: attempt.id, dayId: first?.id };
}

export async function getDsaHistory(userId: string) {
  const { program } = await loadProgramBundle();
  const enrollment = await prisma.dsaEnrollment.findUnique({
    where: { userId_programId: { userId, programId: program.id } },
  });
  if (!enrollment) return { attempts: [], qualifications: [], submissions: [] };

  const attempts = await prisma.dsaWeekAttempt.findMany({
    where: { enrollmentId: enrollment.id },
    include: { week: true },
    orderBy: [{ week: { weekNumber: 'asc' } }, { attemptNumber: 'asc' }, { startedAt: 'asc' }],
  });
  const qualifications = await prisma.dsaQualification.findMany({
    where: { enrollmentId: enrollment.id },
    include: { weekAttempt: { include: { week: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const submissions = await prisma.dsaCodeSubmission.findMany({
    where: { userId },
    include: { problem: { select: { title: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return {
    attempts: attempts.map((a) => ({
      id: a.id,
      weekTitle: a.week.title,
      weekNumber: a.week.weekNumber,
      attemptNumber: a.attemptNumber,
      kind: a.kind,
      status: a.status,
      isActive: a.isActive,
      assessmentPercent: a.assessmentPercent != null ? Number(a.assessmentPercent) : null,
      startedAt: a.startedAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    qualifications: qualifications.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      weekTitle: q.weekAttempt.week.title,
      createdAt: q.createdAt.toISOString(),
    })),
    submissions: submissions.map((s) => ({
      id: s.id,
      problemTitle: s.problem.title,
      language: s.language,
      status: s.status,
      passed: s.passed,
      total: s.total,
      kind: s.kind,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

export function httpErrorStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return 500;
}
