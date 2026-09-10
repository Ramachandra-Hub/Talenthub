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
import type { CodingRubricReport } from '@/lib/exam-v2/coding-rubric';
import {
  DSA_HARD_OPEN_PICK,
  DSA_HARD_OPEN_POINTS,
  DSA_HARD_OPEN_PREFIX,
} from '@/lib/exams/dsa-hard-open-constants';
import {
  buildHardOpenCodingAnalysis,
  scoreHardOpenProblem,
} from '@/lib/exams/dsa-hard-open-score';

export {
  DSA_HARD_OPEN_PICK,
  DSA_HARD_OPEN_POINTS,
  DSA_HARD_OPEN_PREFIX,
} from '@/lib/exams/dsa-hard-open-constants';

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
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

function asResultMap(raw: unknown): Record<string, Record<string, unknown>> {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      out[key] = { ...(entry as Record<string, unknown>) };
    }
  }
  return out;
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

  const requestedTitle = (input.title ?? '').trim();
  let title = requestedTitle || randomDsaHardOpenTitle();
  for (let i = 0; i < 8; i += 1) {
    const clash = await prisma.exam.findUnique({ where: { title }, select: { id: true } });
    if (!clash) break;
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    title = requestedTitle
      ? `${requestedTitle} ${suffix}`
      : randomDsaHardOpenTitle();
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
  if (exam.status === 'ended' || exam.endTime.getTime() <= Date.now()) {
    throw Object.assign(new Error('This open coding exam has ended.'), { status: 403 });
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
  if (exam.status === 'ended' || exam.endTime.getTime() <= Date.now()) {
    throw Object.assign(new Error('This open coding exam has ended.'), { status: 403 });
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
    const results = asResultMap(attempt.results_json);
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
      const results = asResultMap(attempt.results_json);
      const best = results[id];
      const passedN = Number(best?.passed ?? 0);
      const totalN = Number(best?.total ?? 0);
      const pointsN = Number(best?.points ?? 0);
      const lang = typeof best?.language === 'string' ? String(best.language) : 'java';
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
              status: String(best.status ?? 'failed'),
              scorePercent: Number(best.scorePercent ?? 0),
              points: pointsN,
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
  const scored = scoreHardOpenProblem({
    passed: grade.passed,
    total: grade.total,
    compileOk: grade.compileOk,
    sourceCode: input.sourceCode,
    runtimeMs: grade.runtimeMs,
    stderr: grade.stderr,
  });
  const { points, scorePercent, status, rubric } = scored;

  const prev = asResultMap(attempt.results_json);
  const nextResult = {
    status,
    scorePercent,
    points,
    passed: grade.passed,
    total: grade.total,
    language: input.language,
    compileOk: grade.compileOk,
    runtimeMs: grade.runtimeMs,
    publicResults: grade.publicResults,
    rubric,
    scoring: {
      mode: 'tests_first_then_quality',
      testWeight: 0.7,
      qualityWeight: 0.3,
      passRatio: scored.passRatio,
    },
  };
  const prior = prev[input.problemId];
  const priorPoints = Number(prior?.points ?? 0);
  const priorPercent = Number(prior?.scorePercent ?? 0);
  // Keep the best score across submits (same as DSA Arena contests).
  if (
    !prior ||
    points > priorPoints ||
    (points === priorPoints && scorePercent >= priorPercent)
  ) {
    prev[input.problemId] = nextResult;
  }

  let totalScore = 0;
  let solvedCount = 0;
  for (const id of ids) {
    const r = prev[id];
    if (!r) continue;
    totalScore += Number(r.points ?? 0);
    if (r.status === 'passed' || Number(r.scorePercent) >= 100) solvedCount += 1;
  }
  const bestForProblem = prev[input.problemId] ?? nextResult;

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
    status: String(bestForProblem.status ?? status),
    passed: Number(bestForProblem.passed ?? grade.passed),
    total: Number(bestForProblem.total ?? grade.total),
    scorePercent: Number(bestForProblem.scorePercent ?? scorePercent),
    compileOk: grade.compileOk,
    language: input.language,
    publicResults: grade.publicResults,
    points: Number(bestForProblem.points ?? points),
    submitPoints: points,
    totalScore,
    maxScore: DSA_HARD_OPEN_PICK * DSA_HARD_OPEN_POINTS,
  };
}

export async function finalizeDsaHardOpenAttempt(examId: string, userId: string) {
  const { attempt, exam, user } = await startOrResumeDsaHardOpenAttempt(examId, userId);
  const ids = asStringArray(attempt.problem_ids_json);
  const results = asResultMap(attempt.results_json);

  let totalScore = 0;
  let solvedCount = 0;
  let attemptedCount = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const problemResults: NonNullable<PlacementScorecard['problemResults']> = [];
  const rubricRows: Array<{ questionId: string; title: string; rubric: CodingRubricReport }> = [];

  const problems = await prisma.dsaProblem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(problems.map((p) => [p.id, p]));

  ids.forEach((id, idx) => {
    const p = byId.get(id);
    const r = results[id];
    const pts = Number(r?.points ?? 0);
    const passedTests = Number(r?.passed ?? 0);
    const totalTests = Number(r?.total ?? 0);
    const scorePercent = Number(r?.scorePercent ?? 0);
    totalScore += pts;
    if (r) attemptedCount += 1;
    const ok = r?.status === 'passed' || scorePercent >= 100;
    const title = p?.title ?? `Problem ${idx + 1}`;
    if (r?.rubric && typeof r.rubric === 'object') {
      rubricRows.push({
        questionId: id,
        title,
        rubric: r.rubric as CodingRubricReport,
      });
    }
    problemResults.push({
      position: idx + 1,
      title,
      earned: pts,
      marks: DSA_HARD_OPEN_POINTS,
      percent: scorePercent,
      passedTests,
      totalTests,
      status: r ? String(r.status ?? (ok ? 'passed' : 'failed')) : 'skipped',
    });
    if (ok) {
      solvedCount += 1;
      strengths.push(`Solved P${idx + 1}: ${title} (+${pts}/${DSA_HARD_OPEN_POINTS} marks)`);
    } else if (r) {
      strengths.push(
        `Partial credit P${idx + 1}: ${title} (+${pts}/${DSA_HARD_OPEN_POINTS} from tests + code quality)`,
      );
      weaknesses.push(
        `Tests incomplete on P${idx + 1}: ${title} (${passedTests}/${totalTests || '?'} tests)`,
      );
    } else {
      weaknesses.push(`Skipped P${idx + 1}: ${title} (0/${DSA_HARD_OPEN_POINTS} marks)`);
    }
  });

  const codingAnalysis = buildHardOpenCodingAnalysis(rubricRows);

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
    problemResults,
    strengths: strengths.length ? strengths : ['Keep practicing DSA coding patterns.'],
    weaknesses: weaknesses.length ? weaknesses : ['No major gaps recorded.'],
    recommendations: [
      percentage >= 70
        ? 'Strong coding round — review missed edge cases and complexity.'
        : 'Partial credit uses test results first, then code quality and rubric parameters. Keep practicing I/O and edge cases.',
    ],
    reportKind: 'exam',
    codingAnalysis,
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

async function enrichHardOpenScorecard(
  attempt: AttemptRow,
  scorecard: PlacementScorecard,
): Promise<PlacementScorecard> {
  const ids = asStringArray(attempt.problem_ids_json);
  const results = asResultMap(attempt.results_json);
  const problems = await prisma.dsaProblem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(problems.map((p) => [p.id, p]));

  let totalScore = 0;
  const problemResults: NonNullable<PlacementScorecard['problemResults']> = [];
  ids.forEach((id, idx) => {
    const p = byId.get(id);
    const r = results[id];
    const pts = Number(r?.points ?? 0);
    totalScore += pts;
    const passedTests = Number(r?.passed ?? 0);
    const totalTests = Number(r?.total ?? 0);
    const scorePercent = Number(r?.scorePercent ?? 0);
    const ok = r?.status === 'passed' || scorePercent >= 100;
    problemResults.push({
      position: idx + 1,
      title: p?.title ?? `Problem ${idx + 1}`,
      earned: pts,
      marks: DSA_HARD_OPEN_POINTS,
      percent: scorePercent,
      passedTests,
      totalTests,
      status: r ? String(r.status ?? (ok ? 'passed' : 'failed')) : 'skipped',
    });
  });

  const maxScore = DSA_HARD_OPEN_PICK * DSA_HARD_OPEN_POINTS;
  const fromResults = totalScore;
  const fromColumn = Number(attempt.total_score ?? 0);
  const earned =
    fromResults > 0
      ? fromResults
      : fromColumn > 0
        ? fromColumn
        : Number(scorecard.earnedMarks ?? 0);
  const percentage = maxScore > 0 ? Math.round((earned / maxScore) * 10000) / 100 : 0;

  const sections = (scorecard.sections ?? []).map((s) =>
    s.sectionId === 'programming'
      ? {
          ...s,
          marks: maxScore,
          earned,
          percent: percentage,
        }
      : s,
  );

  return {
    ...scorecard,
    totalMarks: maxScore,
    earnedMarks: earned,
    percentage,
    employabilityScore: percentage,
    technicalRating: percentage,
    sections: sections.length
      ? sections
      : [
          {
            sectionId: 'programming',
            name: 'DSA Hard Coding',
            marks: maxScore,
            earned,
            percent: percentage,
            correct: problemResults.filter((p) => p.status === 'passed' || p.percent >= 100).length,
            wrong: problemResults.filter(
              (p) => p.status !== 'skipped' && p.status !== 'passed' && p.percent < 100,
            ).length,
            skipped: problemResults.filter((p) => p.status === 'skipped').length,
            total: DSA_HARD_OPEN_PICK,
          },
        ],
    problemResults,
  };
}

function parseScorecardJson(raw: unknown): PlacementScorecard | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  return value as PlacementScorecard;
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
  const stored = parseScorecardJson(attempt.scorecard_json);
  if (attempt.status === 'submitted' && stored) {
    return enrichHardOpenScorecard(attempt, stored);
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
  const id = String(attemptId ?? '').trim();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { found: false };
  }

  try {
    await ensureDsaHardOpenTables();
    const rows = await prisma.$queryRawUnsafe<AttemptRow[]>(
      `SELECT * FROM "dsa_hard_open_attempts" WHERE "id" = $1::uuid LIMIT 1`,
      id,
    );
    const attempt = rows[0];
    if (!attempt) return { found: false };

    const stored = parseScorecardJson(attempt.scorecard_json);
    if (stored) {
      try {
        return {
          found: true,
          scorecard: await enrichHardOpenScorecard(attempt, stored),
          attemptId: attempt.id,
          userId: attempt.user_id,
        };
      } catch {
        return {
          found: true,
          scorecard: stored,
          attemptId: attempt.id,
          userId: attempt.user_id,
        };
      }
    }

    const submitted = attempt.status === 'submitted' || Boolean(attempt.submitted_at);
    if (submitted) {
      try {
        const scorecard = await finalizeDsaHardOpenAttempt(attempt.exam_id, attempt.user_id);
        return {
          found: true,
          scorecard,
          attemptId: attempt.id,
          userId: attempt.user_id,
        };
      } catch {
        return { found: false };
      }
    }

    return {
      found: true,
      inProgress: true,
      attemptId: attempt.id,
      userId: attempt.user_id,
    };
  } catch {
    return { found: false };
  }
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
