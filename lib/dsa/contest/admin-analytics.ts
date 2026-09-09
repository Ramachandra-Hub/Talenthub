import { prisma } from '@/lib/prisma';
import { ensureDsaTables, ensureDsaSchemaExtensions } from '@/lib/dsa/ensure-tables';
import { ensureDsaContestTables } from '@/lib/dsa/contest/ensure-tables';
import { assertContestPublishable } from '@/lib/dsa/contest/publish-rules';

async function ready() {
  await ensureDsaTables();
  await ensureDsaSchemaExtensions();
  await ensureDsaContestTables();
}

export async function adminListContests() {
  await ready();
  const contests = await prisma.dsaCodingContest.findMany({
    include: {
      _count: { select: { attempts: true, problems: true, submissions: true } },
      problems: { select: { position: true, problem: { select: { title: true } } } },
    },
    orderBy: { title: 'asc' },
  });
  return contests.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    status: c.status,
    isPublished: c.isPublished,
    isActive: c.isActive,
    durationMinutes: c.durationMinutes,
    problemCount: c._count.problems,
    attemptCount: c._count.attempts,
    submissionCount: c._count.submissions,
    problems: c.problems
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ position: p.position, title: p.problem.title })),
  }));
}

export async function adminContestOverview() {
  await ready();
  const [contestCount, publishedCount, attempts, submissions] = await Promise.all([
    prisma.dsaCodingContest.count(),
    prisma.dsaCodingContest.count({ where: { isPublished: true } }),
    prisma.dsaCodingContestAttempt.findMany({
      select: {
        totalScore: true,
        maxScore: true,
        solvedCount: true,
        userId: true,
        status: true,
      },
    }),
    prisma.dsaCodeSubmission.findMany({
      where: { contestId: { not: null } },
      select: {
        language: true,
        status: true,
        runtimeMs: true,
        scorePercent: true,
      },
    }),
  ]);

  const participants = new Set(attempts.map((a) => a.userId)).size;
  const java = submissions.filter((s) => s.language === 'java');
  const python = submissions.filter((s) => s.language === 'python');
  const avgScore =
    attempts.length > 0
      ? attempts.reduce((s, a) => s + (a.maxScore ? a.totalScore / a.maxScore : 0), 0) /
        attempts.length
      : 0;
  const avgRuntime =
    submissions.filter((s) => s.runtimeMs != null).length > 0
      ? submissions.reduce((s, x) => s + (x.runtimeMs ?? 0), 0) /
        submissions.filter((s) => s.runtimeMs != null).length
      : null;

  return {
    totalContests: contestCount,
    publishedContests: publishedCount,
    studentsParticipated: participants,
    totalSubmissions: submissions.length,
    totalProblemsSolved: attempts.reduce((s, a) => s + a.solvedCount, 0),
    averageScorePercent: Math.round(avgScore * 10000) / 100,
    averageRuntimeMs: avgRuntime != null ? Math.round(avgRuntime) : null,
    javaAttempts: java.length,
    pythonAttempts: python.length,
    javaSuccessRate:
      java.length > 0
        ? Math.round((java.filter((s) => s.status === 'passed').length / java.length) * 10000) /
          100
        : 0,
    pythonSuccessRate:
      python.length > 0
        ? Math.round(
            (python.filter((s) => s.status === 'passed').length / python.length) * 10000,
          ) / 100
        : 0,
  };
}

export async function adminContestSummary(contestId: string) {
  await ready();
  const contest = await prisma.dsaCodingContest.findUnique({
    where: { id: contestId },
    include: { _count: { select: { problems: true, attempts: true, submissions: true } } },
  });
  if (!contest) throw new Error('Contest not found');
  const attempts = await prisma.dsaCodingContestAttempt.findMany({
    where: { contestId },
    select: {
      status: true,
      totalScore: true,
      maxScore: true,
      durationSeconds: true,
    },
  });
  const completed = attempts.filter((a) => a.status === 'submitted');
  const avgScore =
    attempts.length > 0
      ? attempts.reduce((s, a) => s + (a.maxScore ? a.totalScore / a.maxScore : 0), 0) /
        attempts.length
      : 0;
  const withDuration = completed.filter((a) => a.durationSeconds != null);
  const avgCompletion =
    withDuration.length > 0
      ? Math.round(
          withDuration.reduce((s, a) => s + (a.durationSeconds ?? 0), 0) / withDuration.length,
        )
      : null;
  return {
    contestId: contest.id,
    title: contest.title,
    status: contest.status,
    problemCount: contest._count.problems,
    totalParticipants: attempts.length,
    completedAttempts: completed.length,
    totalSubmissions: contest._count.submissions,
    averageScorePercent: Math.round(avgScore * 10000) / 100,
    averageCompletionSeconds: avgCompletion,
  };
}

export async function adminContestStudents(contestId: string) {
  await ready();
  const attempts = await prisma.dsaCodingContestAttempt.findMany({
    where: { contestId },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          rollNumber: true,
          branch: true,
          academicYear: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const submissionAgg = await prisma.dsaCodeSubmission.groupBy({
    by: ['contestAttemptId', 'language'],
    where: { contestId },
    _count: { _all: true },
  });

  return attempts.map((a) => {
    const langs = submissionAgg.filter((g) => g.contestAttemptId === a.id);
    return {
      attemptId: a.id,
      userId: a.userId,
      name: a.user.fullName,
      rollNumber: a.user.rollNumber,
      department: a.user.branch,
      academicYear: a.user.academicYear,
      status: a.status,
      attemptedCount: a.attemptedCount,
      solvedCount: a.solvedCount,
      totalScore: a.totalScore,
      maxScore: a.maxScore,
      percentage: a.maxScore ? Math.round((a.totalScore / a.maxScore) * 10000) / 100 : 0,
      javaAttempts: langs.find((l) => l.language === 'java')?._count._all ?? 0,
      pythonAttempts: langs.find((l) => l.language === 'python')?._count._all ?? 0,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      durationSeconds: a.durationSeconds,
    };
  });
}

export async function adminContestProblems(contestId: string) {
  await ready();
  const links = await prisma.dsaCodingContestProblem.findMany({
    where: { contestId },
    include: { problem: true },
    orderBy: { position: 'asc' },
  });
  const subs = await prisma.dsaCodeSubmission.findMany({
    where: { contestId },
    select: {
      problemId: true,
      userId: true,
      language: true,
      status: true,
      scorePercent: true,
      runtimeMs: true,
      failureType: true,
    },
  });

  return links.map((link) => {
    const rows = subs.filter((s) => s.problemId === link.problemId);
    const users = new Set(rows.map((r) => r.userId));
    const solvedUsers = new Set(rows.filter((r) => r.status === 'passed').map((r) => r.userId));
    const java = rows.filter((r) => r.language === 'java');
    const python = rows.filter((r) => r.language === 'python');
    return {
      position: link.position,
      problemId: link.problemId,
      title: link.problem.title,
      category: link.problem.categoryLabel,
      difficulty: link.problem.difficulty,
      totalAttempts: rows.length,
      uniqueStudents: users.size,
      solvedCount: solvedUsers.size,
      failedCount: Math.max(0, users.size - solvedUsers.size),
      successRate: users.size
        ? Math.round((solvedUsers.size / users.size) * 10000) / 100
        : 0,
      solvePercent: users.size
        ? Math.round((solvedUsers.size / users.size) * 10000) / 100
        : 0,
      averageScore:
        rows.length > 0
          ? Math.round(
              (rows.reduce((s, r) => s + Number(r.scorePercent), 0) / rows.length) * 100,
            ) / 100
          : 0,
      javaAttempts: java.length,
      pythonAttempts: python.length,
      javaSuccessRate: java.length
        ? Math.round((java.filter((r) => r.status === 'passed').length / java.length) * 10000) /
          100
        : 0,
      pythonSuccessRate: python.length
        ? Math.round(
            (python.filter((r) => r.status === 'passed').length / python.length) * 10000,
          ) / 100
        : 0,
      averageRuntimeMs:
        rows.filter((r) => r.runtimeMs != null).length > 0
          ? Math.round(
              rows.reduce((s, r) => s + (r.runtimeMs ?? 0), 0) /
                rows.filter((r) => r.runtimeMs != null).length,
            )
          : null,
      compileFailures: rows.filter((r) => r.failureType === 'COMPILE_ERROR').length,
      runtimeFailures: rows.filter((r) => r.failureType === 'RUNTIME_ERROR').length,
      wrongAnswers: rows.filter((r) => r.failureType === 'WRONG_ANSWER').length,
    };
  });
}

export async function adminContestSubmissions(contestId: string) {
  await ready();
  const rows = await prisma.dsaCodeSubmission.findMany({
    where: { contestId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      user: { select: { fullName: true, rollNumber: true } },
      problem: { select: { title: true } },
      contest: { select: { title: true, slug: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    studentName: r.user.fullName,
    rollNumber: r.user.rollNumber,
    contestTitle: r.contest?.title ?? null,
    problemTitle: r.problem.title,
    language: r.language,
    status: r.status,
    scorePercent: Number(r.scorePercent),
    passed: r.passed,
    total: r.total,
    runtimeMs: r.runtimeMs,
    memoryKb: r.memoryKb,
    compileOk: r.compileOk,
    failureType: r.failureType,
    sourceCode: r.sourceCode,
    stderr: r.stderr,
    stdout: r.stdout,
    submittedAt: r.createdAt,
  }));
}

export async function adminPublishContest(contestId: string) {
  await ready();
  const contest = await prisma.dsaCodingContest.findUnique({
    where: { id: contestId },
    include: { problems: true },
  });
  if (!contest) throw new Error('Contest not found');
  assertContestPublishable(contest.problems.length);
  const problemIds = contest.problems.map((p) => p.problemId);
  if (new Set(problemIds).size !== problemIds.length) {
    throw new Error('Duplicate problems are not allowed in a contest');
  }
  return prisma.dsaCodingContest.update({
    where: { id: contestId },
    data: { isPublished: true, status: 'active' },
  });
}
