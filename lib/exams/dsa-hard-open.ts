import { randomBytes, randomUUID, createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { academicYearsMatch } from '@/lib/academic-year-match';
import { COLLEGE } from '@/lib/college-brand';
import { gradeDsaSource, parseTestCases } from '@/lib/dsa/grade';
import { toStudentContestProblemDto } from '@/lib/dsa/contest/serialize';
import { isCodingLanguageId } from '@/lib/coding/languages';
import { newOpenLinkToken, openJoinPath, resolveOpenLinkPassword } from '@/lib/exams/open-exam-link';
import { DEFAULT_EXAM_STUDENT_PASSWORD } from '@/lib/roster-credentials-export';
import type { PlacementScorecard } from '@/lib/placement/types';

export const DSA_HARD_OPEN_PREFIX = 'dsa_hard_open:';
export const DSA_HARD_OPEN_PICK = 5;
export const DSA_HARD_OPEN_POINTS = 20;

const TITLE_POOL = [
  'DSA Hard Coding Challenge',
  'Campus Hard Coding Sprint',
  'Tree & Network Hard Arena',
  'IV Year Hard Coding Round',
  'Elite DSA Coding Gauntlet',
  'Hard Path Query Coding Test',
  'Binary Tree Hard Coding Cup',
  'Rooted DFS Hard Coding Exam',
] as const;

let tablesReady = false;

export function isDsaHardOpenTestId(testId: string | null | undefined): boolean {
  return Boolean(testId && testId.startsWith(DSA_HARD_OPEN_PREFIX));
}

export function examIdFromDsaHardOpenTestId(testId: string): string | null {
  if (!isDsaHardOpenTestId(testId)) return null;
  return testId.slice(DSA_HARD_OPEN_PREFIX.length) || null;
}

export function dsaHardOpenTestId(examId: string): string {
  return `${DSA_HARD_OPEN_PREFIX}${examId}`;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = Number.parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomDsaHardOpenTitle(): string {
  const base = TITLE_POOL[Math.floor(Math.random() * TITLE_POOL.length)];
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `${base} ${suffix}`;
}

export async function ensureDsaHardOpenTables(): Promise<void> {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "dsa_hard_open_attempts" (
      "id" UUID PRIMARY KEY,
      "exam_id" UUID NOT NULL,
      "user_id" UUID NOT NULL,
      "problem_ids_json" JSONB NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'in_progress',
      "total_score" INTEGER NOT NULL DEFAULT 0,
      "max_score" INTEGER NOT NULL DEFAULT 100,
      "solved_count" INTEGER NOT NULL DEFAULT 0,
      "results_json" JSONB,
      "scorecard_json" JSONB,
      "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "submitted_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "dsa_hard_open_attempts_exam_user_uidx"
    ON "dsa_hard_open_attempts" ("exam_id", "user_id")
  `);
  tablesReady = true;
}

type AttemptRow = {
  id: string;
  exam_id: string;
  user_id: string;
  problem_ids_json: unknown;
  status: string;
  total_score: number;
  max_score: number;
  solved_count: number;
  results_json: unknown;
  scorecard_json: unknown;
  started_at: Date;
  submitted_at: Date | null;
};

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
}

export async function createAndPublishDsaHardOpenExam(input: {
  adminUserId: string;
  title?: string;
  durationMinutes?: number;
  password?: string;
}): Promise<{
  examId: string;
  title: string;
  openLinkPath: string;
  openLinkPassword: string;
  token: string;
  problemPoolSize: number;
}> {
  await ensureDsaHardOpenTables();
  const pool = await prisma.dsaProblem.count({
    where: { contestBank: true, isActive: true },
  });
  if (pool < DSA_HARD_OPEN_PICK) {
    throw new Error(
      `Need at least ${DSA_HARD_OPEN_PICK} contest-bank coding problems (found ${pool}). Run the DSA question bank import first.`,
    );
  }

  let title = (input.title ?? '').trim() || randomDsaHardOpenTitle();
  for (let i = 0; i < 5; i += 1) {
    const clash = await prisma.exam.findUnique({ where: { title }, select: { id: true } });
    if (!clash) break;
    title = randomDsaHardOpenTitle();
  }

  const token = newOpenLinkToken();
  const password = resolveOpenLinkPassword(input.password ?? DEFAULT_EXAM_STUDENT_PASSWORD);
  const now = new Date();
  const end = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  const duration = Math.max(30, Math.min(180, input.durationMinutes ?? 60));

  const exam = await prisma.exam.create({
    data: {
      title,
      description:
        'DSA Hard open-link coding exam (locked mode). Pool: contest-bank Java/Python. Draw: 5 jumbled. 60 min timer. ElevateX-style proctor + results. IV Year only.',
      duration,
      totalMarks: DSA_HARD_OPEN_PICK * DSA_HARD_OPEN_POINTS,
      passingMarks: Math.round(DSA_HARD_OPEN_PICK * DSA_HARD_OPEN_POINTS * 0.4),
      startTime: now,
      endTime: end,
      status: 'published',
      createdBy: null,
      openLinkEnabled: true,
      openLinkToken: token,
      openLinkPassword: password,
      publishedTestId: 'pending',
    },
  });

  if (input.adminUserId) {
    try {
      await prisma.exam.update({
        where: { id: exam.id },
        data: { createdBy: input.adminUserId },
      });
    } catch {
      // Admin session may not map to users.id — exam still publishes.
    }
  }

  await prisma.exam.update({
    where: { id: exam.id },
    data: { publishedTestId: dsaHardOpenTestId(exam.id) },
  });

  return {
    examId: exam.id,
    title,
    openLinkPath: openJoinPath(token),
    openLinkPassword: password,
    token,
    problemPoolSize: pool,
  };
}

export async function listDsaHardOpenExams() {
  const rows = await prisma.exam.findMany({
    where: {
      openLinkEnabled: true,
      publishedTestId: { startsWith: DSA_HARD_OPEN_PREFIX },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      duration: true,
      status: true,
      openLinkToken: true,
      openLinkPassword: true,
      publishedTestId: true,
      createdAt: true,
      _count: { select: { openLinkEntries: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    duration: r.duration,
    status: r.status,
    openLinkPath: r.openLinkToken ? openJoinPath(r.openLinkToken) : null,
    openLinkPassword: resolveOpenLinkPassword(r.openLinkPassword),
    joinCount: r._count.openLinkEntries,
    createdAt: r.createdAt,
  }));
}

async function loadBankProblems() {
  return prisma.dsaProblem.findMany({
    where: { contestBank: true, isActive: true },
    orderBy: { title: 'asc' },
  });
}

export async function startOrResumeDsaHardOpenAttempt(examId: string, userId: string) {
  await ensureDsaHardOpenTables();
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam?.openLinkEnabled || !isDsaHardOpenTestId(exam.publishedTestId)) {
    throw Object.assign(new Error('Open coding exam not found'), { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { academicYear: true, rollNumber: true, fullName: true, branch: true, email: true },
  });
  if (!academicYearsMatch(user?.academicYear, 'IV Year')) {
    throw Object.assign(new Error('This open coding exam is for IV Year students only.'), {
      status: 403,
    });
  }

  const existing = await prisma.$queryRawUnsafe<AttemptRow[]>(
    `SELECT * FROM "dsa_hard_open_attempts" WHERE "exam_id" = $1::uuid AND "user_id" = $2::uuid LIMIT 1`,
    examId,
    userId,
  );
  if (existing[0]) {
    return { attempt: existing[0], exam, user, resumed: true };
  }

  const pool = await loadBankProblems();
  if (pool.length < DSA_HARD_OPEN_PICK) {
    throw Object.assign(new Error('Coding problem bank is not ready.'), { status: 500 });
  }
  const drawn = seededShuffle(pool, `${examId}:${userId}`).slice(0, DSA_HARD_OPEN_PICK);
  const problemIds = drawn.map((p) => p.id);
  const id = randomUUID();
  const maxScore = DSA_HARD_OPEN_PICK * DSA_HARD_OPEN_POINTS;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "dsa_hard_open_attempts"
      ("id","exam_id","user_id","problem_ids_json","status","total_score","max_score","solved_count","results_json","started_at","created_at","updated_at")
     VALUES ($1::uuid,$2::uuid,$3::uuid,$4::jsonb,'in_progress',0,$5,0,'{}'::jsonb,NOW(),NOW(),NOW())`,
    id,
    examId,
    userId,
    JSON.stringify(problemIds),
    maxScore,
  );

  const rows = await prisma.$queryRawUnsafe<AttemptRow[]>(
    `SELECT * FROM "dsa_hard_open_attempts" WHERE "id" = $1::uuid LIMIT 1`,
    id,
  );
  return { attempt: rows[0]!, exam, user, resumed: false };
}

export async function getDsaHardOpenBrief(examId: string, userId: string) {
  await ensureDsaHardOpenTables();
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam?.openLinkEnabled || !isDsaHardOpenTestId(exam.publishedTestId)) {
    throw Object.assign(new Error('Open coding exam not found'), { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { academicYear: true },
  });
  if (!academicYearsMatch(user?.academicYear, 'IV Year')) {
    throw Object.assign(new Error('This open coding exam is for IV Year students only.'), {
      status: 403,
    });
  }

  const existing = await prisma.$queryRawUnsafe<AttemptRow[]>(
    `SELECT * FROM "dsa_hard_open_attempts" WHERE "exam_id" = $1::uuid AND "user_id" = $2::uuid LIMIT 1`,
    examId,
    userId,
  );
  const attempt = existing[0] ?? null;
  let problems: Array<{
    position: number;
    title: string;
    difficulty: string;
    category: string | null;
    tags: string[];
    points: number;
    progress?: string;
  }> = [];

  if (attempt) {
    const ids = asStringArray(attempt.problem_ids_json);
    const rows = await prisma.dsaProblem.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const results =
      attempt.results_json && typeof attempt.results_json === 'object'
        ? (attempt.results_json as Record<string, { status?: string; scorePercent?: number }>)
        : {};
    problems = ids.map((id, idx) => {
      const p = byId.get(id);
      const best = results[id];
      const rawTags = p?.tagsJson;
      const tags = Array.isArray(rawTags)
        ? rawTags.map(String)
        : rawTags && typeof rawTags === 'object'
          ? Object.values(rawTags as Record<string, unknown>).map(String)
          : [];
      return {
        position: idx + 1,
        title: p?.title ?? `Problem ${idx + 1}`,
        difficulty: p?.difficulty ?? 'Hard',
        category: p?.categoryLabel ?? null,
        tags,
        points: DSA_HARD_OPEN_POINTS,
        progress:
          best?.status === 'passed' || Number(best?.scorePercent) >= 100
            ? 'solved'
            : best
              ? 'attempted'
              : 'not_started',
      };
    });
  }

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.duration,
      totalMarks: exam.totalMarks,
      problemCount: DSA_HARD_OPEN_PICK,
    },
    attempt: attempt
      ? {
          id: attempt.id,
          status: attempt.status,
          totalScore: attempt.total_score,
          maxScore: attempt.max_score,
          solvedCount: attempt.solved_count,
        }
      : null,
    problems,
    instructions:
      'Solve exactly 5 hard coding problems in Java or Python. Problems are drawn from the campus contest bank and jumbled for your attempt.\n\n' +
      'Same Code Lab as DSA practice: read the statement, constraints, samples, and explanation; run sample input; submit for server-side grading.\n\n' +
      'When you finish, you get an immediate full ElevateX-style scorecard.',
  };
}

export async function startDsaHardOpenChallenge(examId: string, userId: string) {
  const { attempt, exam, resumed } = await startOrResumeDsaHardOpenAttempt(examId, userId);
  return {
    examId: exam.id,
    attemptId: attempt.id,
    status: attempt.status,
    resumed,
    completed: attempt.status === 'submitted',
  };
}

function attemptEndsAt(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

async function finalizeIfTimedOut(
  examId: string,
  userId: string,
  attempt: AttemptRow,
  durationMinutes: number,
): Promise<boolean> {
  if (attempt.status === 'submitted') return false;
  const ends = attemptEndsAt(new Date(attempt.started_at), durationMinutes);
  if (Date.now() <= ends.getTime()) return false;
  await finalizeDsaHardOpenAttempt(examId, userId);
  return true;
}

export async function getDsaHardOpenLabPayload(examId: string, userId: string) {
  const { attempt, exam } = await startOrResumeDsaHardOpenAttempt(examId, userId);
  if (attempt.status === 'submitted') {
    throw Object.assign(new Error('Attempt already submitted'), { status: 403 });
  }
  if (await finalizeIfTimedOut(examId, userId, attempt, exam.duration)) {
    throw Object.assign(new Error('Time is up. Your exam was auto-submitted.'), {
      status: 410,
      code: 'TIME_UP',
    });
  }
  const ids = asStringArray(attempt.problem_ids_json);
  const problems = await prisma.dsaProblem.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(problems.map((p) => [p.id, p]));
  const ordered = ids
    .map((id, idx) => {
      const p = byId.get(id);
      if (!p) return null;
      const dto = toStudentContestProblemDto(p, {
        position: idx + 1,
        points: DSA_HARD_OPEN_POINTS,
      });
      const results =
        attempt.results_json && typeof attempt.results_json === 'object'
          ? (attempt.results_json as Record<string, { status?: string; scorePercent?: number }>)
          : {};
      const best = results[id];
      const passedN = Number((best as { passed?: number } | undefined)?.passed ?? 0);
      const totalN = Number((best as { total?: number } | undefined)?.total ?? 0);
      const lang =
        typeof (best as { language?: string } | undefined)?.language === 'string'
          ? String((best as { language?: string }).language)
          : 'java';
      return {
        ...dto,
        progress:
          best?.status === 'passed' || Number(best?.scorePercent) >= 100
            ? 'solved'
            : best
              ? 'attempted'
              : 'not_started',
        best: best
          ? {
              status: best.status ?? 'failed',
              scorePercent: Number(best.scorePercent ?? 0),
              passed: passedN,
              total: totalN,
              language: lang,
            }
          : null,
      };
    })
    .filter(Boolean);

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.duration,
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.started_at,
      endsAt: attemptEndsAt(new Date(attempt.started_at), exam.duration).toISOString(),
      totalScore: attempt.total_score,
      maxScore: attempt.max_score,
      solvedCount: attempt.solved_count,
    },
    problems: ordered,
  };
}

export async function submitDsaHardOpenCode(input: {
  examId: string;
  userId: string;
  problemId: string;
  language: string;
  sourceCode: string;
}) {
  if (!input.sourceCode.trim()) throw Object.assign(new Error('Source code is required'), { status: 400 });
  if (!isCodingLanguageId(input.language) || !['java', 'python'].includes(input.language)) {
    throw Object.assign(new Error('Only Java and Python are allowed'), { status: 400 });
  }

  const { attempt } = await startOrResumeDsaHardOpenAttempt(input.examId, input.userId);
  if (attempt.status === 'submitted') {
    throw Object.assign(new Error('Attempt already submitted'), { status: 403 });
  }
  const exam = await prisma.exam.findUnique({
    where: { id: input.examId },
    select: { duration: true },
  });
  if (
    exam &&
    (await finalizeIfTimedOut(input.examId, input.userId, attempt, exam.duration))
  ) {
    throw Object.assign(new Error('Time is up. Your exam was auto-submitted.'), {
      status: 410,
      code: 'TIME_UP',
    });
  }
  const ids = asStringArray(attempt.problem_ids_json);
  if (!ids.includes(input.problemId)) {
    throw Object.assign(new Error('Problem is not part of this attempt'), { status: 403 });
  }

  const problem = await prisma.dsaProblem.findUnique({ where: { id: input.problemId } });
  if (!problem) throw Object.assign(new Error('Problem not found'), { status: 404 });

  const cases = parseTestCases(problem.testCasesJson);
  const grade = await gradeDsaSource({
    language: input.language,
    sourceCode: input.sourceCode,
    testCases: cases,
  });
  const scorePercent = Math.round(grade.fraction * 10000) / 100;
  const status = grade.total > 0 && grade.passed === grade.total ? 'passed' : 'failed';
  const points = Math.round((scorePercent / 100) * DSA_HARD_OPEN_POINTS);

  const prev =
    attempt.results_json && typeof attempt.results_json === 'object'
      ? { ...(attempt.results_json as Record<string, unknown>) }
      : {};
  prev[input.problemId] = {
    status,
    scorePercent,
    points,
    passed: grade.passed,
    total: grade.total,
    language: input.language,
    compileOk: grade.compileOk,
    runtimeMs: grade.runtimeMs,
    publicResults: grade.publicResults,
  };

  let totalScore = 0;
  let solvedCount = 0;
  for (const id of ids) {
    const r = prev[id] as { points?: number; scorePercent?: number; status?: string } | undefined;
    if (!r) continue;
    totalScore += Number(r.points ?? 0);
    if (r.status === 'passed' || Number(r.scorePercent) >= 100) solvedCount += 1;
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "dsa_hard_open_attempts"
     SET "results_json" = $1::jsonb,
         "total_score" = $2,
         "solved_count" = $3,
         "updated_at" = NOW()
     WHERE "id" = $4::uuid`,
    JSON.stringify(prev),
    totalScore,
    solvedCount,
    attempt.id,
  );

  return {
    status,
    passed: grade.passed,
    total: grade.total,
    scorePercent,
    compileOk: grade.compileOk,
    language: input.language,
    publicResults: grade.publicResults,
    points,
  };
}

export async function finalizeDsaHardOpenAttempt(examId: string, userId: string) {
  const { attempt, exam, user } = await startOrResumeDsaHardOpenAttempt(examId, userId);
  const ids = asStringArray(attempt.problem_ids_json);
  const results =
    attempt.results_json && typeof attempt.results_json === 'object'
      ? (attempt.results_json as Record<
          string,
          {
            status?: string;
            scorePercent?: number;
            points?: number;
            language?: string;
            passed?: number;
            total?: number;
          }
        >)
      : {};

  let totalScore = 0;
  let solvedCount = 0;
  let attemptedCount = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const problems = await prisma.dsaProblem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(problems.map((p) => [p.id, p]));

  ids.forEach((id, idx) => {
    const p = byId.get(id);
    const r = results[id];
    const pts = Number(r?.points ?? 0);
    totalScore += pts;
    if (r) attemptedCount += 1;
    const ok = r?.status === 'passed' || Number(r?.scorePercent) >= 100;
    if (ok) {
      solvedCount += 1;
      strengths.push(`Solved P${idx + 1}: ${p?.title ?? id}`);
    } else {
      weaknesses.push(`Gap on P${idx + 1}: ${p?.title ?? id}`);
    }
  });

  const maxScore = DSA_HARD_OPEN_PICK * DSA_HARD_OPEN_POINTS;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
  const sectionDetails: PlacementScorecard['sections'] = [
    {
      sectionId: 'programming',
      name: 'DSA Hard Coding',
      marks: maxScore,
      earned: totalScore,
      percent: percentage,
      correct: solvedCount,
      wrong: Math.max(0, attemptedCount - solvedCount),
      skipped: Math.max(0, DSA_HARD_OPEN_PICK - attemptedCount),
      total: DSA_HARD_OPEN_PICK,
    },
  ];

  const readiness: PlacementScorecard['placementReadiness'] =
    percentage >= 85
      ? 'Excellent'
      : percentage >= 70
        ? 'Strong'
        : percentage >= 50
          ? 'Developing'
          : 'Needs work';

  const startedAt = new Date(attempt.started_at).toISOString();
  const completedAt = new Date().toISOString();
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000),
  );

  const scorecard: PlacementScorecard = {
    candidate: {
      fullName: user?.fullName ?? user?.rollNumber ?? 'Student',
      hallTicket: user?.rollNumber ?? '',
      email: user?.email ?? null,
      departmentId: user?.branch ?? 'generic',
      collegeName: COLLEGE.shortName,
      examName: exam.title,
      startedAt,
      seed: attempt.id,
      technicalFormat: 'coding',
      examTotalMarks: maxScore,
      examDurationSec: exam.duration * 60,
    },
    startedAt,
    completedAt,
    totalElapsedSec: elapsedSec,
    totalMarks: maxScore,
    earnedMarks: totalScore,
    percentage,
    employabilityScore: percentage,
    technicalRating: percentage,
    communicationRating: 0,
    placementReadiness: readiness,
    sections: sectionDetails,
    strengths: strengths.length ? strengths : ['Keep practicing DSA coding patterns.'],
    weaknesses: weaknesses.length ? weaknesses : ['No major gaps recorded.'],
    recommendations: [
      percentage >= 70
        ? 'Strong coding round — review missed edge cases and complexity.'
        : 'Revisit tree/path problems and practice Java/Python I/O carefully.',
    ],
    reportKind: 'exam',
  };

  await prisma.$executeRawUnsafe(
    `UPDATE "dsa_hard_open_attempts"
     SET "status" = 'submitted',
         "total_score" = $1,
         "solved_count" = $2,
         "scorecard_json" = $3::jsonb,
         "submitted_at" = NOW(),
         "updated_at" = NOW()
     WHERE "id" = $4::uuid`,
    totalScore,
    solvedCount,
    JSON.stringify(scorecard),
    attempt.id,
  );

  return scorecard;
}

export async function getDsaHardOpenResult(examId: string, userId: string) {
  await ensureDsaHardOpenTables();
  const rows = await prisma.$queryRawUnsafe<AttemptRow[]>(
    `SELECT * FROM "dsa_hard_open_attempts" WHERE "exam_id" = $1::uuid AND "user_id" = $2::uuid LIMIT 1`,
    examId,
    userId,
  );
  const attempt = rows[0];
  if (!attempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });
  if (attempt.status === 'submitted' && attempt.scorecard_json) {
    return attempt.scorecard_json as PlacementScorecard;
  }
  throw Object.assign(new Error('Attempt not submitted yet. Finish the exam to view results.'), {
    status: 403,
  });
}

/** Admin live-dashboard / Full report lookup by hard-open attempt id. */
export async function getDsaHardOpenScorecardByAttemptId(attemptId: string): Promise<
  | { found: true; scorecard: PlacementScorecard; attemptId: string; userId: string }
  | { found: true; inProgress: true; attemptId: string; userId: string }
  | { found: false }
> {
  await ensureDsaHardOpenTables();
  const rows = await prisma.$queryRawUnsafe<AttemptRow[]>(
    `SELECT * FROM "dsa_hard_open_attempts" WHERE "id" = $1::uuid LIMIT 1`,
    attemptId,
  );
  const attempt = rows[0];
  if (!attempt) return { found: false };

  if (attempt.scorecard_json && typeof attempt.scorecard_json === 'object') {
    return {
      found: true,
      scorecard: attempt.scorecard_json as PlacementScorecard,
      attemptId: attempt.id,
      userId: attempt.user_id,
    };
  }

  const submitted = attempt.status === 'submitted' || Boolean(attempt.submitted_at);
  if (submitted) {
    const scorecard = await finalizeDsaHardOpenAttempt(attempt.exam_id, attempt.user_id);
    return {
      found: true,
      scorecard,
      attemptId: attempt.id,
      userId: attempt.user_id,
    };
  }

  return {
    found: true,
    inProgress: true,
    attemptId: attempt.id,
    userId: attempt.user_id,
  };
}

export async function listDsaHardOpenAttemptsForAdmin(examId: string) {
  await ensureDsaHardOpenTables();
  const rows = await prisma.$queryRawUnsafe<
    Array<AttemptRow & { full_name: string | null; roll_number: string | null }>
  >(
    `SELECT a.*, u."full_name", u."roll_number"
     FROM "dsa_hard_open_attempts" a
     JOIN "users" u ON u."id" = a."user_id"
     WHERE a."exam_id" = $1::uuid
     ORDER BY a."submitted_at" DESC NULLS LAST, a."started_at" DESC`,
    examId,
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    totalScore: r.total_score,
    maxScore: r.max_score,
    solvedCount: r.solved_count,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    fullName: r.full_name,
    rollNumber: r.roll_number,
    percentage:
      r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 10000) / 100 : 0,
    scorecard: r.scorecard_json as PlacementScorecard | null,
  }));
}
