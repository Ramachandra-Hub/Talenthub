import { prisma } from '@/lib/prisma';
import { gradeDsaSource, parseTestCases } from '@/lib/dsa/grade';
import { assertDsaCodingContestEligible } from '@/lib/dsa/contest/eligibility';
import { toStudentContestProblemDto } from '@/lib/dsa/contest/serialize';
import {
  CONTEST_POINTS_PER_PROBLEM,
  CONTEST_PROBLEM_COUNT,
  type DsaFailureType,
} from '@/lib/dsa/contest/types';
import { assertContestPublishable } from '@/lib/dsa/contest/publish-rules';
import { ensureDsaTables, ensureDsaSchemaExtensions } from '@/lib/dsa/ensure-tables';
import { ensureDsaContestTables } from '@/lib/dsa/contest/ensure-tables';
import { isCodingLanguageId } from '@/lib/coding/languages';

async function ensureContestReady() {
  await ensureDsaTables();
  await ensureDsaSchemaExtensions();
  await ensureDsaContestTables();
}

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

function nowMs() {
  return Date.now();
}

export function deriveContestLifecycle(contest: {
  status: string;
  isPublished: boolean;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}): 'draft' | 'upcoming' | 'live' | 'ended' | 'unavailable' {
  if (!contest.isActive) return 'unavailable';
  if (!contest.isPublished || contest.status === 'draft') return 'draft';
  if (contest.status === 'archived') return 'unavailable';
  const t = nowMs();
  if (contest.startsAt && t < contest.startsAt.getTime()) return 'upcoming';
  if (contest.endsAt && t > contest.endsAt.getTime()) return 'ended';
  if (contest.status === 'ended') return 'ended';
  return 'live';
}

export { assertContestPublishable } from '@/lib/dsa/contest/publish-rules';

function mapFailureType(input: {
  compileOk: boolean;
  passed: number;
  total: number;
  stderr: string;
}): DsaFailureType {
  if (input.total > 0 && input.passed === input.total) return 'ACCEPTED';
  if (!input.compileOk || /compil/i.test(input.stderr)) return 'COMPILE_ERROR';
  if (/timeout|time limit/i.test(input.stderr)) return 'TIME_LIMIT';
  if (/memory/i.test(input.stderr)) return 'MEMORY_LIMIT';
  if (input.stderr.trim()) return 'RUNTIME_ERROR';
  return 'WRONG_ANSWER';
}

async function loadContestOrThrow(contestIdOrSlug: string) {
  await ensureContestReady();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      contestIdOrSlug,
    );
  const contest = await prisma.dsaCodingContest.findFirst({
    where: isUuid
      ? { OR: [{ id: contestIdOrSlug }, { slug: contestIdOrSlug }] }
      : { slug: contestIdOrSlug },
    include: {
      problems: {
        orderBy: { position: 'asc' },
        include: { problem: true },
      },
    },
  });
  if (!contest) throw httpError('Contest not found', 404);
  return contest;
}

export async function listContestsForStudent(userId: string) {
  await ensureContestReady();
  const eligible = await assertDsaCodingContestEligible(userId).then(
    () => true,
    () => false,
  );

  const contests = await prisma.dsaCodingContest.findMany({
    where: { isActive: true, isPublished: true, status: { in: ['published', 'active', 'ended'] } },
    include: {
      problems: { include: { problem: { select: { difficulty: true, categoryLabel: true } } } },
      attempts: {
        where: { userId },
        select: {
          id: true,
          status: true,
          totalScore: true,
          maxScore: true,
          solvedCount: true,
          attemptedCount: true,
          submittedAt: true,
        },
        take: 1,
      },
    },
    orderBy: { title: 'asc' },
  });

  return {
    eligible,
    contests: contests.map((c) => {
      const life = deriveContestLifecycle(c);
      const attempt = c.attempts[0] ?? null;
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        difficulty: c.difficulty,
        durationMinutes: c.durationMinutes,
        problemCount: c.problems.length,
        difficultyMix: c.problems.map((p) => p.problem.difficulty),
        categories: [...new Set(c.problems.map((p) => p.problem.categoryLabel).filter(Boolean))],
        lifecycle: life,
        attempt: attempt
          ? {
              id: attempt.id,
              status: attempt.status,
              totalScore: attempt.totalScore,
              maxScore: attempt.maxScore,
              solvedCount: attempt.solvedCount,
              attemptedCount: attempt.attemptedCount,
              submittedAt: attempt.submittedAt,
            }
          : null,
      };
    }),
  };
}

export async function getContestDetailForStudent(userId: string, contestIdOrSlug: string) {
  /** Browse brief without eligibility; start / lab / submit stay gated. */
  const eligible = await assertDsaCodingContestEligible(userId).then(
    () => true,
    () => false,
  );
  const contest = await loadContestOrThrow(contestIdOrSlug);
  const life = deriveContestLifecycle(contest);
  if (life === 'draft' || life === 'unavailable') {
    throw httpError('Contest is not available', 403);
  }
  if (contest.problems.length !== CONTEST_PROBLEM_COUNT) {
    throw httpError('Contest is misconfigured', 500);
  }

  const attempt = await prisma.dsaCodingContestAttempt.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId } },
  });

  return {
    id: contest.id,
    slug: contest.slug,
    title: contest.title,
    description: contest.description,
    instructions: contest.instructions,
    difficulty: contest.difficulty,
    durationMinutes: contest.durationMinutes,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    lifecycle: life,
    eligible,
    languages: ['java', 'python'],
    problems: contest.problems.map((link) => ({
      position: link.position,
      points: link.points,
      id: link.problem.id,
      title: link.problem.title,
      difficulty: link.problem.difficulty,
      category: link.problem.categoryLabel,
      tags: Array.isArray(link.problem.tagsJson)
        ? (link.problem.tagsJson as string[])
        : [],
    })),
    attempt: attempt
      ? {
          id: attempt.id,
          status: attempt.status,
          totalScore: attempt.totalScore,
          maxScore: attempt.maxScore,
          solvedCount: attempt.solvedCount,
          attemptedCount: attempt.attemptedCount,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          durationSeconds: attempt.durationSeconds,
        }
      : null,
  };
}

export async function startContestAttempt(userId: string, contestIdOrSlug: string) {
  await assertDsaCodingContestEligible(userId);
  const contest = await loadContestOrThrow(contestIdOrSlug);
  const life = deriveContestLifecycle(contest);
  if (life !== 'live') {
    throw httpError(`Contest cannot be started (status: ${life})`, 403);
  }
  assertContestPublishable(contest.problems.length);

  const existing = await prisma.dsaCodingContestAttempt.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId } },
  });
  if (existing) {
    if (existing.status === 'submitted' || existing.status === 'expired') {
      return { attempt: existing, contestId: contest.id, resumed: true, completed: true };
    }
    return { attempt: existing, contestId: contest.id, resumed: true, completed: false };
  }

  const attempt = await prisma.dsaCodingContestAttempt.create({
    data: {
      contestId: contest.id,
      userId,
      status: 'in_progress',
      maxScore: contest.problems.reduce((s, p) => s + p.points, 0),
      totalScore: 0,
      solvedCount: 0,
      attemptedCount: 0,
    },
  });
  return { attempt, contestId: contest.id, resumed: false, completed: false };
}

export async function getContestLabPayload(userId: string, contestIdOrSlug: string) {
  await assertDsaCodingContestEligible(userId);
  const contest = await loadContestOrThrow(contestIdOrSlug);
  const life = deriveContestLifecycle(contest);
  if (life !== 'live' && life !== 'ended') {
    throw httpError('Contest lab unavailable', 403);
  }
  const attempt = await prisma.dsaCodingContestAttempt.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId } },
  });
  if (!attempt) throw httpError('Start the contest before opening Code Lab', 400);

  const submissions = await prisma.dsaCodeSubmission.findMany({
    where: { contestAttemptId: attempt.id, userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      problemId: true,
      language: true,
      passed: true,
      total: true,
      scorePercent: true,
      status: true,
      compileOk: true,
      failureType: true,
      runtimeMs: true,
      createdAt: true,
      sourceCode: true,
    },
  });

  const bestByProblem = new Map<string, (typeof submissions)[number]>();
  for (const sub of submissions) {
    const prev = bestByProblem.get(sub.problemId);
    if (!prev || Number(sub.scorePercent) > Number(prev.scorePercent)) {
      bestByProblem.set(sub.problemId, sub);
    }
  }

  const problems = contest.problems.map((link) => {
    const dto = toStudentContestProblemDto(link.problem, {
      position: link.position,
      points: link.points,
    });
    const best = bestByProblem.get(link.problemId) ?? null;
    let progress: 'not_started' | 'attempted' | 'solved' | 'failed' = 'not_started';
    if (best) {
      progress =
        best.status === 'passed' || Number(best.scorePercent) >= 100
          ? 'solved'
          : 'failed';
      if (progress === 'failed' && Number(best.scorePercent) > 0) progress = 'attempted';
    }
    return {
      ...dto,
      progress,
      best: best
        ? {
            passed: best.passed,
            total: best.total,
            status: best.status,
            language: best.language,
            scorePercent: Number(best.scorePercent),
          }
        : null,
    };
  });

  return {
    mode: 'dsa-contest' as const,
    contest: {
      id: contest.id,
      slug: contest.slug,
      title: contest.title,
      durationMinutes: contest.durationMinutes,
      lifecycle: life,
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      totalScore: attempt.totalScore,
      maxScore: attempt.maxScore,
      solvedCount: attempt.solvedCount,
      attemptedCount: attempt.attemptedCount,
    },
    problems,
  };
}

export async function submitContestCode(input: {
  userId: string;
  contestIdOrSlug: string;
  problemId: string;
  language: string;
  sourceCode: string;
}) {
  await assertDsaCodingContestEligible(input.userId);
  if (!input.sourceCode.trim()) throw httpError('Source code is required', 400);
  if (!isCodingLanguageId(input.language) || !['java', 'python'].includes(input.language)) {
    throw httpError('Only Java and Python are allowed in contests', 400);
  }

  const contest = await loadContestOrThrow(input.contestIdOrSlug);
  const life = deriveContestLifecycle(contest);
  if (life !== 'live') throw httpError('Contest is not accepting submissions', 403);

  const attempt = await prisma.dsaCodingContestAttempt.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId: input.userId } },
  });
  if (!attempt || attempt.userId !== input.userId) {
    throw httpError('Contest attempt not found', 404);
  }
  if (attempt.status === 'submitted' || attempt.status === 'expired') {
    throw httpError('Contest attempt is closed', 403);
  }

  const link = contest.problems.find((p) => p.problemId === input.problemId);
  if (!link) throw httpError('Problem is not part of this contest', 403);
  if (link.position < 1 || link.position > CONTEST_PROBLEM_COUNT) {
    throw httpError('Invalid contest problem position', 400);
  }

  const problem = link.problem;
  const allowed = Array.isArray(problem.languagesJson)
    ? problem.languagesJson.map(String)
    : ['java', 'python'];
  if (!allowed.includes(input.language)) {
    throw httpError('Language not allowed for this problem', 400);
  }

  const cases = parseTestCases(problem.testCasesJson);
  const grade = await gradeDsaSource({
    language: input.language,
    sourceCode: input.sourceCode,
    testCases: cases,
  });
  const passedAll = grade.total > 0 && grade.passed === grade.total;
  const scorePercent = Math.round(grade.fraction * 10000) / 100;
  const failureType = mapFailureType({
    compileOk: grade.compileOk,
    passed: grade.passed,
    total: grade.total,
    stderr: grade.stderr,
  });
  const publicCases = cases.filter((c) => !c.hidden);
  const hiddenCases = cases.filter((c) => c.hidden);

  const row = await prisma.dsaCodeSubmission.create({
    data: {
      userId: input.userId,
      weekAttemptId: null,
      problemId: problem.id,
      language: input.language,
      sourceCode: input.sourceCode,
      passed: grade.passed,
      total: grade.total,
      scorePercent,
      status: passedAll ? 'passed' : 'failed',
      stdout: grade.stdout.slice(0, 4000),
      stderr: grade.stderr.slice(0, 4000),
      runtimeMs: grade.runtimeMs,
      kind: 'contest',
      contestId: contest.id,
      contestAttemptId: attempt.id,
      compileOk: grade.compileOk,
      failureType,
      publicPassed: grade.publicResults.filter((r) => r.passed).length,
      publicTotal: publicCases.length,
      hiddenPassed: Math.max(0, grade.passed - grade.publicResults.filter((r) => r.passed).length),
      hiddenTotal: hiddenCases.length,
    },
  });

  await recalculateContestAttempt(attempt.id);

  return {
    submissionId: row.id,
    problemId: problem.id,
    language: input.language,
    status: row.status,
    passed: grade.passed,
    total: grade.total,
    scorePercent,
    compileOk: grade.compileOk,
    failureType,
    runtimeMs: grade.runtimeMs,
    publicResults: grade.publicResults,
  };
}

export async function recalculateContestAttempt(attemptId: string) {
  const attempt = await prisma.dsaCodingContestAttempt.findUnique({
    where: { id: attemptId },
    include: {
      contest: { include: { problems: true } },
      submissions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!attempt) return null;

  const best = new Map<string, { score: number; passedAll: boolean }>();
  for (const sub of attempt.submissions) {
    const score = Math.round(
      (Number(sub.scorePercent) / 100) *
        (attempt.contest.problems.find((p) => p.problemId === sub.problemId)?.points ??
          CONTEST_POINTS_PER_PROBLEM),
    );
    const prev = best.get(sub.problemId);
    if (!prev || score > prev.score) {
      best.set(sub.problemId, {
        score,
        passedAll: sub.status === 'passed' || Number(sub.scorePercent) >= 100,
      });
    }
  }

  const totalScore = [...best.values()].reduce((s, b) => s + b.score, 0);
  const solvedCount = [...best.values()].filter((b) => b.passedAll).length;
  const attemptedCount = best.size;
  const maxScore = attempt.contest.problems.reduce((s, p) => s + p.points, 0);

  return prisma.dsaCodingContestAttempt.update({
    where: { id: attemptId },
    data: {
      totalScore,
      maxScore,
      solvedCount,
      attemptedCount,
      status: attempt.status === 'submitted' ? 'submitted' : 'in_progress',
    },
  });
}

export async function finalizeContestAttempt(userId: string, contestIdOrSlug: string) {
  await assertDsaCodingContestEligible(userId);
  const contest = await loadContestOrThrow(contestIdOrSlug);
  const attempt = await prisma.dsaCodingContestAttempt.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId } },
  });
  if (!attempt || attempt.userId !== userId) throw httpError('Attempt not found', 404);

  await recalculateContestAttempt(attempt.id);
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000),
  );
  const updated = await prisma.dsaCodingContestAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'submitted',
      submittedAt: new Date(),
      durationSeconds,
    },
  });
  return getContestResultForStudent(userId, contest.id);
}

export async function getContestResultForStudent(userId: string, contestIdOrSlug: string) {
  await assertDsaCodingContestEligible(userId);
  const contest = await loadContestOrThrow(contestIdOrSlug);
  const attempt = await prisma.dsaCodingContestAttempt.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId } },
  });
  if (!attempt || attempt.userId !== userId) throw httpError('Attempt not found', 404);

  const submissions = await prisma.dsaCodeSubmission.findMany({
    where: { contestAttemptId: attempt.id, userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      problemId: true,
      language: true,
      status: true,
      scorePercent: true,
      passed: true,
      total: true,
      runtimeMs: true,
      compileOk: true,
      failureType: true,
      createdAt: true,
    },
  });

  const bestByProblem = new Map<string, (typeof submissions)[number]>();
  for (const sub of submissions) {
    const prev = bestByProblem.get(sub.problemId);
    if (!prev || Number(sub.scorePercent) > Number(prev.scorePercent)) {
      bestByProblem.set(sub.problemId, sub);
    }
  }

  const problemResults = contest.problems.map((link) => {
    const best = bestByProblem.get(link.problemId) ?? null;
    return {
      position: link.position,
      problemId: link.problemId,
      title: link.problem.title,
      points: link.points,
      language: best?.language ?? null,
      status: best
        ? best.status === 'passed' || Number(best.scorePercent) >= 100
          ? 'solved'
          : 'failed'
        : 'not_attempted',
      scorePercent: best ? Number(best.scorePercent) : 0,
      passed: best?.passed ?? 0,
      total: best?.total ?? 0,
      compileOk: best?.compileOk ?? null,
      runtimeMs: best?.runtimeMs ?? null,
      submissionCount: submissions.filter((s) => s.problemId === link.problemId).length,
    };
  });

  return {
    contest: { id: contest.id, slug: contest.slug, title: contest.title },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      totalScore: attempt.totalScore,
      maxScore: attempt.maxScore,
      solvedCount: attempt.solvedCount,
      attemptedCount: attempt.attemptedCount,
      durationSeconds: attempt.durationSeconds,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      percentage:
        attempt.maxScore > 0
          ? Math.round((attempt.totalScore / attempt.maxScore) * 10000) / 100
          : 0,
    },
    problems: problemResults,
    history: submissions.map((s) => ({
      id: s.id,
      problemId: s.problemId,
      problemTitle:
        contest.problems.find((p) => p.problemId === s.problemId)?.problem.title ?? 'Problem',
      language: s.language,
      status: s.status,
      scorePercent: Number(s.scorePercent),
      passed: s.passed,
      total: s.total,
      runtimeMs: s.runtimeMs,
      compileOk: s.compileOk,
      failureType: s.failureType,
      submittedAt: s.createdAt,
    })),
  };
}
