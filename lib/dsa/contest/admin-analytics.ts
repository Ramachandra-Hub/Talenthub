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
  const contest = await prisma.dsaCodingContest.findUnique({
    where: { id: contestId },
    include: {
      problems: {
        orderBy: { position: 'asc' },
        include: { problem: { select: { id: true, title: true, difficulty: true } } },
      },
    },
  });
  if (!contest) throw new Error('Contest not found');

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
          email: true,
        },
      },
    },
    orderBy: [{ totalScore: 'desc' }, { submittedAt: 'asc' }, { updatedAt: 'desc' }],
  });

  const submissions = await prisma.dsaCodeSubmission.findMany({
    where: { contestId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      contestAttemptId: true,
      problemId: true,
      language: true,
      status: true,
      scorePercent: true,
      passed: true,
      total: true,
      compileOk: true,
      failureType: true,
      runtimeMs: true,
      createdAt: true,
    },
  });

  const problemMeta = contest.problems.map((p) => ({
    position: p.position,
    problemId: p.problemId,
    title: p.problem.title,
    difficulty: p.problem.difficulty,
  }));

  return attempts.map((a, index) => {
    const attemptSubs = submissions.filter((s) => s.contestAttemptId === a.id);
    const bestByProblem = new Map<string, (typeof attemptSubs)[number]>();
    for (const sub of attemptSubs) {
      const prev = bestByProblem.get(sub.problemId);
      if (!prev || Number(sub.scorePercent) > Number(prev.scorePercent)) {
        bestByProblem.set(sub.problemId, sub);
      }
    }

    const problemResults = problemMeta.map((p) => {
      const best = bestByProblem.get(p.problemId) ?? null;
      const solved = best
        ? best.status === 'passed' || Number(best.scorePercent) >= 100
        : false;
      return {
        position: p.position,
        problemId: p.problemId,
        title: p.title,
        difficulty: p.difficulty,
        status: best ? (solved ? 'solved' : 'failed') : 'not_attempted',
        scorePercent: best ? Number(best.scorePercent) : 0,
        language: best?.language ?? null,
        submissionCount: attemptSubs.filter((s) => s.problemId === p.problemId).length,
        compileOk: best?.compileOk ?? null,
        failureType: best?.failureType ?? null,
        runtimeMs: best?.runtimeMs ?? null,
      };
    });

    const javaAttempts = attemptSubs.filter((s) => s.language === 'java').length;
    const pythonAttempts = attemptSubs.filter((s) => s.language === 'python').length;
    const percentage = a.maxScore
      ? Math.round((a.totalScore / a.maxScore) * 10000) / 100
      : 0;

    return {
      rank: index + 1,
      attemptId: a.id,
      userId: a.userId,
      name: a.user.fullName,
      rollNumber: a.user.rollNumber,
      email: a.user.email,
      department: a.user.branch,
      academicYear: a.user.academicYear,
      status: a.status,
      attemptedCount: a.attemptedCount,
      solvedCount: a.solvedCount,
      totalScore: a.totalScore,
      maxScore: a.maxScore,
      percentage,
      javaAttempts,
      pythonAttempts,
      submissionCount: attemptSubs.length,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      durationSeconds: a.durationSeconds,
      problemResults,
    };
  });
}

/** ElevateX-style full report for one contest attempt (admin only). */
export async function adminContestStudentReport(contestId: string, attemptId: string) {
  await ready();
  const attempt = await prisma.dsaCodingContestAttempt.findFirst({
    where: { id: attemptId, contestId },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          rollNumber: true,
          branch: true,
          academicYear: true,
          email: true,
          college: true,
        },
      },
      contest: {
        select: {
          id: true,
          title: true,
          slug: true,
          durationMinutes: true,
          problems: {
            orderBy: { position: 'asc' },
            include: {
              problem: {
                select: {
                  id: true,
                  title: true,
                  difficulty: true,
                  categoryLabel: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!attempt) throw new Error('Attempt not found');

  const submissions = await prisma.dsaCodeSubmission.findMany({
    where: { contestAttemptId: attemptId, contestId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      problemId: true,
      language: true,
      status: true,
      scorePercent: true,
      passed: true,
      total: true,
      compileOk: true,
      failureType: true,
      runtimeMs: true,
      sourceCode: true,
      stdout: true,
      stderr: true,
      createdAt: true,
      problem: { select: { title: true } },
    },
  });

  const bestByProblem = new Map<string, (typeof submissions)[number]>();
  for (const sub of submissions) {
    const prev = bestByProblem.get(sub.problemId);
    if (!prev || Number(sub.scorePercent) > Number(prev.scorePercent)) {
      bestByProblem.set(sub.problemId, sub);
    }
  }

  const problems = attempt.contest.problems.map((link) => {
    const best = bestByProblem.get(link.problemId) ?? null;
    const solved = best
      ? best.status === 'passed' || Number(best.scorePercent) >= 100
      : false;
    return {
      position: link.position,
      problemId: link.problemId,
      title: link.problem.title,
      difficulty: link.problem.difficulty,
      category: link.problem.categoryLabel,
      status: best ? (solved ? 'solved' : 'failed') : 'not_attempted',
      scorePercent: best ? Number(best.scorePercent) : 0,
      language: best?.language ?? null,
      passed: best?.passed ?? 0,
      total: best?.total ?? 0,
      compileOk: best?.compileOk ?? null,
      failureType: best?.failureType ?? null,
      runtimeMs: best?.runtimeMs ?? null,
      submissionCount: submissions.filter((s) => s.problemId === link.problemId).length,
      bestSourceCode: best?.sourceCode ?? null,
      bestStdout: best?.stdout ?? null,
      bestStderr: best?.stderr ?? null,
    };
  });

  const percentage = attempt.maxScore
    ? Math.round((attempt.totalScore / attempt.maxScore) * 10000) / 100
    : 0;

  const feedback = {
    strengths: problems.filter((p) => p.status === 'solved').map((p) => p.title),
    gaps: problems
      .filter((p) => p.status !== 'solved')
      .map((p) =>
        p.status === 'not_attempted'
          ? `${p.title} (not attempted)`
          : `${p.title} (${p.failureType || 'failed'})`,
      ),
    recommendation:
      percentage >= 100
        ? 'Excellent — all contest problems solved.'
        : percentage >= 66
          ? 'Strong showing. Review failed/unattempted problems and strengthen edge-case handling.'
          : percentage >= 33
            ? 'Partial completion. Revisit problem statements, I/O formats, and sample tests before resubmitting practice.'
            : 'Needs focused practice on contest fundamentals: parsing input, testing samples, and language familiarity (Java/Python).',
  };

  return {
    contest: {
      id: attempt.contest.id,
      title: attempt.contest.title,
      slug: attempt.contest.slug,
      durationMinutes: attempt.contest.durationMinutes,
    },
    student: {
      userId: attempt.user.id,
      name: attempt.user.fullName,
      rollNumber: attempt.user.rollNumber,
      email: attempt.user.email,
      department: attempt.user.branch,
      academicYear: attempt.user.academicYear,
      college: attempt.user.college,
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      totalScore: attempt.totalScore,
      maxScore: attempt.maxScore,
      percentage,
      solvedCount: attempt.solvedCount,
      attemptedCount: attempt.attemptedCount,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      durationSeconds: attempt.durationSeconds,
    },
    problems,
    history: submissions.map((s) => ({
      id: s.id,
      problemId: s.problemId,
      problemTitle: s.problem.title,
      language: s.language,
      status: s.status,
      scorePercent: Number(s.scorePercent),
      passed: s.passed,
      total: s.total,
      compileOk: s.compileOk,
      failureType: s.failureType,
      runtimeMs: s.runtimeMs,
      sourceCode: s.sourceCode,
      submittedAt: s.createdAt,
    })),
    feedback,
    languageSummary: {
      java: submissions.filter((s) => s.language === 'java').length,
      python: submissions.filter((s) => s.language === 'python').length,
    },
  };
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
