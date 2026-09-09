/**
 * DSA Arena coding contest integration tests (real DB + services).
 * Skips cleanly if DATABASE_URL / seeded bank is unavailable.
 */
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

describe.runIf(hasDb)('DSA coding contests integration', () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let service: typeof import('@/lib/dsa/contest/service');
  let adminContestSummary: typeof import('@/lib/dsa/contest/admin-analytics').adminContestSummary;
  let adminListContestBankProblems: typeof import('@/lib/dsa/contest/admin-mutate').adminListContestBankProblems;
  let toStudentContestProblemDto: typeof import('@/lib/dsa/contest/serialize').toStudentContestProblemDto;
  let assertStudentSafeProblemPayload: typeof import('@/lib/dsa/contest/serialize').assertStudentSafeProblemPayload;
  let assertContestPublishable: typeof import('@/lib/dsa/contest/publish-rules').assertContestPublishable;
  let executeCode: typeof import('@/lib/coding/execute').executeCode;

  let ivUserId = '';
  let otherUserId = '';
  let contestId = '';
  let contestSlug = '';
  let problemIds: string[] = [];
  let attemptId = '';

  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    service = await import('@/lib/dsa/contest/service');
    ({ adminContestSummary } = await import('@/lib/dsa/contest/admin-analytics'));
    ({ adminListContestBankProblems } = await import('@/lib/dsa/contest/admin-mutate'));
    ({ toStudentContestProblemDto, assertStudentSafeProblemPayload } = await import(
      '@/lib/dsa/contest/serialize'
    ));
    ({ assertContestPublishable } = await import('@/lib/dsa/contest/publish-rules'));
    ({ executeCode } = await import('@/lib/coding/execute'));

    const bankCount = await prisma.dsaProblem.count({ where: { contestBank: true } });
    expect(bankCount).toBe(50);

    const contest = await prisma.dsaCodingContest.findFirst({
      where: { isPublished: true, isActive: true, status: 'active' },
      include: {
        problems: { orderBy: { position: 'asc' }, include: { problem: true } },
      },
      orderBy: { title: 'asc' },
    });
    expect(contest).toBeTruthy();
    expect(contest!.problems).toHaveLength(3);
    contestId = contest!.id;
    contestSlug = contest!.slug;
    problemIds = contest!.problems.map((p) => p.problemId);

    const iv = await prisma.user.findFirst({
      where: { academicYear: { contains: 'IV' } },
      select: { id: true },
    });
    const other = await prisma.user.findFirst({
      where: { id: { not: iv?.id ?? '00000000-0000-0000-0000-000000000000' } },
      select: { id: true },
    });
    expect(iv).toBeTruthy();
    expect(other).toBeTruthy();
    ivUserId = iv!.id;
    otherUserId = other!.id;

    await prisma.dsaCodeSubmission.deleteMany({
      where: { contestId, userId: ivUserId },
    });
    await prisma.dsaCodingContestAttempt.deleteMany({
      where: { contestId, userId: ivUserId },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$disconnect();
  });

  it('question bank has 50 imported contest problems', async () => {
    const count = await prisma.dsaProblem.count({ where: { contestBank: true } });
    expect(count).toBe(50);
    const bank = await adminListContestBankProblems();
    expect(bank).toHaveLength(50);
  });

  it('contest list returns real contests with exactly 3 problems each', async () => {
    const list = await service.listContestsForStudent(ivUserId);
    expect(list.contests.length).toBeGreaterThan(0);
    const match = list.contests.find((c) => c.id === contestId);
    expect(match).toBeTruthy();
    expect(match!.problemCount).toBe(3);
    expect(match!.title).toMatch(/DSA Arena Coding Challenge/);
  });

  it('contest detail exposes exactly 3 real questions without solutions', async () => {
    const detail = await service.getContestDetailForStudent(ivUserId, contestSlug);
    expect(detail.problems).toHaveLength(3);
    expect(detail.problems[0]!.title.length).toBeGreaterThan(3);
    const blob = JSON.stringify(detail);
    expect(blob).not.toMatch(/referenceSolutions|solution\.code|"solution"/i);
  });

  it('student can start active contest and receives contestAttemptId', async () => {
    const started = await service.startContestAttempt(ivUserId, contestId);
    expect(started.attempt.id).toBeTruthy();
    expect(started.contestId).toBe(contestId);
    attemptId = started.attempt.id;

    const again = await service.startContestAttempt(ivUserId, contestId);
    expect(again.attempt.id).toBe(attemptId);
    expect(again.resumed).toBe(true);
  });

  it('contest lab opens with problem 1/2/3 payloads (whitelist only)', async () => {
    const lab = await service.getContestLabPayload(ivUserId, contestId);
    expect(lab.mode).toBe('dsa-contest');
    expect(lab.attempt.id).toBe(attemptId);
    expect(lab.problems).toHaveLength(3);

    for (const p of lab.problems) {
      expect(p.statement.length).toBeGreaterThan(10);
      expect(p.inputFormat.length).toBeGreaterThan(0);
      expect(p.outputFormat.length).toBeGreaterThan(0);
      expect(p.languages).toEqual(expect.arrayContaining(['java', 'python']));
      assertStudentSafeProblemPayload(p);
      expect(JSON.stringify(p)).not.toContain('referenceSolutions');
      expect('solution' in p).toBe(false);
    }

    expect(lab.problems[0]!.position).toBe(1);
    expect(lab.problems[1]!.position).toBe(2);
    expect(lab.problems[2]!.position).toBe(3);
  });

  it('Java execution path is wired (structured runner result)', async () => {
    const result = await executeCode(
      'java',
      `public class Main {
  public static void main(String[] args) {
    System.out.println("ok-java");
  }
}`,
      '',
    );
    expect(typeof result.stdout).toBe('string');
    expect(typeof result.stderr).toBe('string');
    expect(typeof result.exitCode).toBe('number');
    // Local JDK may be absent on the agent host; still prove the runner returns feedback.
    if (result.stdout.includes('ok-java')) {
      expect(result.exitCode).toBe(0);
    } else {
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(/java|javac/i.test(result.stderr)).toBe(true);
    }
  }, 60_000);

  it('Python execution path is wired (structured runner result)', async () => {
    const result = await executeCode('python', 'print("ok-python")', '');
    expect(typeof result.stdout).toBe('string');
    expect(typeof result.stderr).toBe('string');
    expect(typeof result.exitCode).toBe('number');
    if (result.stdout.includes('ok-python')) {
      expect(result.exitCode).toBe(0);
    } else {
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(/python/i.test(result.stderr)).toBe(true);
    }
  }, 60_000);

  it('submission persists server-side for a contest problem', async () => {
    const problemId = problemIds[0]!;
    const submitted = await service.submitContestCode({
      userId: ivUserId,
      contestIdOrSlug: contestId,
      problemId,
      language: 'python',
      sourceCode: 'print("not-matching-sample")\n',
    });
    expect(submitted.submissionId).toBeTruthy();
    expect(submitted.problemId).toBe(problemId);
    expect(typeof submitted.scorePercent).toBe('number');
    expect(['passed', 'failed']).toContain(submitted.status);

    const row = await prisma.dsaCodeSubmission.findUnique({
      where: { id: submitted.submissionId },
    });
    expect(row?.contestId).toBe(contestId);
    expect(row?.contestAttemptId).toBe(attemptId);
    expect(row?.userId).toBe(ivUserId);
    expect(row?.sourceCode).toContain('not-matching-sample');
  }, 90_000);

  it('result calculation returns 3-problem breakdown', async () => {
    await service.finalizeContestAttempt(ivUserId, contestId);
    const result = await service.getContestResultForStudent(ivUserId, contestId);
    expect(result.problems).toHaveLength(3);
    expect(result.attempt.solvedCount).toBeGreaterThanOrEqual(0);
    expect(result.attempt.solvedCount).toBeLessThanOrEqual(3);
    expect(typeof result.attempt.percentage).toBe('number');
  });

  it('admin can access contest result analytics', async () => {
    const summary = await adminContestSummary(contestId);
    expect(summary.totalParticipants).toBeGreaterThanOrEqual(1);
    expect(summary.problemCount).toBe(3);
  });

  it('student cannot access another student attempt result', async () => {
    await expect(service.getContestResultForStudent(otherUserId, contestId)).rejects.toThrow();
  });

  it('student serializer never returns solution / reference code from DB row', async () => {
    const problem = await prisma.dsaProblem.findFirst({
      where: { id: problemIds[0]! },
    });
    expect(problem).toBeTruthy();
    expect(problem!.referenceSolutionsJson).toBeTruthy();
    const refs = problem!.referenceSolutionsJson as { java?: string };
    const dto = toStudentContestProblemDto(problem!, { position: 1, points: 100 });
    const text = JSON.stringify(dto);
    expect(text).not.toContain('referenceSolutions');
    expect('solution' in (dto as object)).toBe(false);
    expect('referenceSolutionsJson' in (dto as object)).toBe(false);
    // Reference solutions contain algorithm helpers (e.g. Edge/dfs) that starters do not.
    if (refs.java && /static class Edge/.test(refs.java)) {
      expect(text).not.toContain('static class Edge');
    }
    if (refs.java && /static\s+long\s+dfs\s*\(/.test(refs.java)) {
      expect(text).not.toMatch(/static\s+long\s+dfs\s*\(/);
    }
    assertStudentSafeProblemPayload(dto);
  });

  it('published contest cannot contain != 3 problems', () => {
    expect(() => assertContestPublishable(0)).toThrow(/exactly 3/);
    expect(() => assertContestPublishable(1)).toThrow(/exactly 3/);
    expect(() => assertContestPublishable(2)).toThrow(/exactly 3/);
    expect(() => assertContestPublishable(4)).toThrow(/exactly 3/);
    expect(() => assertContestPublishable(3)).not.toThrow();
  });

  it('code persistence keys are per problem (lab model contract)', async () => {
    const lab = await service.getContestLabPayload(ivUserId, contestId);
    const keys = lab.problems.map((p) => `${p.id}:java`);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('student cannot access admin contest APIs (auth contract)', () => {
  it('admin analytics module is separate from student serializers', async () => {
    const serializeSrc = fs.readFileSync(
      path.join(process.cwd(), 'lib/dsa/contest/serialize.ts'),
      'utf8',
    );
    expect(serializeSrc).not.toMatch(/admin-analytics|adminContestSummary/);
    expect(serializeSrc).toMatch(/toStudentContestProblemDto/);
  });
});
