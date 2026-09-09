import { prisma } from '@/lib/prisma';
import { ensureDsaTables, ensureDsaSchemaExtensions } from '@/lib/dsa/ensure-tables';
import { ensureDsaContestTables } from '@/lib/dsa/contest/ensure-tables';
import { assertContestPublishable } from '@/lib/dsa/contest/publish-rules';
import { CONTEST_POINTS_PER_PROBLEM, CONTEST_PROBLEM_COUNT } from '@/lib/dsa/contest/types';

async function ready() {
  await ensureDsaTables();
  await ensureDsaSchemaExtensions();
  await ensureDsaContestTables();
}

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || `contest-${Date.now()}`
  );
}

export async function adminListContestBankProblems() {
  await ready();
  const rows = await prisma.dsaProblem.findMany({
    where: { contestBank: true, isActive: true },
    select: {
      id: true,
      title: true,
      difficulty: true,
      categoryLabel: true,
      tagsJson: true,
      sourceBankKey: true,
      referenceSolutionStatus: true,
    },
    orderBy: [{ categoryLabel: 'asc' }, { title: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    difficulty: r.difficulty,
    category: r.categoryLabel,
    tags: Array.isArray(r.tagsJson) ? (r.tagsJson as string[]) : [],
    sourceBankKey: r.sourceBankKey,
    referenceSolutionStatus: r.referenceSolutionStatus,
  }));
}

export async function adminCreateContest(input: {
  title: string;
  description?: string | null;
  instructions?: string | null;
  durationMinutes?: number;
  problemIds?: string[];
}) {
  await ready();
  const title = input.title.trim();
  if (!title) throw httpError('Title is required', 400);
  const problemIds = input.problemIds ?? [];
  if (problemIds.length > CONTEST_PROBLEM_COUNT) {
    throw httpError(`Draft contests may have at most ${CONTEST_PROBLEM_COUNT} problems`, 400);
  }
  if (new Set(problemIds).size !== problemIds.length) {
    throw httpError('Duplicate problems are not allowed in one contest', 400);
  }

  let slug = slugify(title);
  const existing = await prisma.dsaCodingContest.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  if (problemIds.length > 0) {
    const found = await prisma.dsaProblem.count({
      where: { id: { in: problemIds }, contestBank: true },
    });
    if (found !== problemIds.length) {
      throw httpError('All selected problems must exist in the contest question bank', 400);
    }
  }

  const contest = await prisma.$transaction(async (tx) => {
    const created = await tx.dsaCodingContest.create({
      data: {
        slug,
        title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        durationMinutes: input.durationMinutes ?? 60,
        status: 'draft',
        isPublished: false,
        isActive: true,
        difficulty: 'mixed',
      },
    });
    for (let i = 0; i < problemIds.length; i += 1) {
      await tx.dsaCodingContestProblem.create({
        data: {
          contestId: created.id,
          problemId: problemIds[i]!,
          position: i + 1,
          points: CONTEST_POINTS_PER_PROBLEM,
        },
      });
    }
    return created;
  });

  return { id: contest.id, slug: contest.slug, title: contest.title, status: contest.status };
}

export async function adminUpdateContest(
  contestId: string,
  input: {
    title?: string;
    description?: string | null;
    instructions?: string | null;
    durationMinutes?: number;
    problemIds?: string[];
    status?: 'draft' | 'published' | 'active' | 'ended';
    startsAt?: string | null;
    endsAt?: string | null;
  },
) {
  await ready();
  const contest = await prisma.dsaCodingContest.findUnique({
    where: { id: contestId },
    include: { _count: { select: { problems: true } } },
  });
  if (!contest) throw httpError('Contest not found', 404);

  const problemIds = input.problemIds;
  if (problemIds) {
    if (problemIds.length > CONTEST_PROBLEM_COUNT) {
      throw httpError(`Contests may have at most ${CONTEST_PROBLEM_COUNT} problems`, 400);
    }
    if (new Set(problemIds).size !== problemIds.length) {
      throw httpError('Duplicate problems are not allowed in one contest', 400);
    }
    if (problemIds.length > 0) {
      const found = await prisma.dsaProblem.count({
        where: { id: { in: problemIds }, contestBank: true },
      });
      if (found !== problemIds.length) {
        throw httpError('All selected problems must exist in the contest question bank', 400);
      }
    }
  }

  const nextStatus = input.status ?? contest.status;
  const nextProblemCount = problemIds ? problemIds.length : contest._count.problems;

  if (nextStatus === 'published' || nextStatus === 'active') {
    assertContestPublishable(nextProblemCount);
  }

  return prisma.$transaction(async (tx) => {
    if (problemIds) {
      await tx.dsaCodingContestProblem.deleteMany({ where: { contestId } });
      for (let i = 0; i < problemIds.length; i += 1) {
        await tx.dsaCodingContestProblem.create({
          data: {
            contestId,
            problemId: problemIds[i]!,
            position: i + 1,
            points: CONTEST_POINTS_PER_PROBLEM,
          },
        });
      }
    }

    const isPublished = nextStatus === 'published' || nextStatus === 'active' || nextStatus === 'ended';
    const updated = await tx.dsaCodingContest.update({
      where: { id: contestId },
      data: {
        ...(input.title != null ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.durationMinutes != null ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.startsAt !== undefined
          ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
          : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
          : {}),
        status: nextStatus,
        isPublished: nextStatus === 'draft' ? false : isPublished || contest.isPublished,
        isActive: true,
      },
      include: {
        problems: {
          orderBy: { position: 'asc' },
          include: { problem: { select: { id: true, title: true, difficulty: true } } },
        },
      },
    });

    return {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      status: updated.status,
      isPublished: updated.isPublished,
      problemCount: updated.problems.length,
      problems: updated.problems.map((p) => ({
        position: p.position,
        id: p.problem.id,
        title: p.problem.title,
        difficulty: p.problem.difficulty,
      })),
    };
  });
}

export async function adminPublishContest(contestId: string, activate = true) {
  await ready();
  const count = await prisma.dsaCodingContestProblem.count({ where: { contestId } });
  assertContestPublishable(count);
  return adminUpdateContest(contestId, {
    status: activate ? 'active' : 'published',
    startsAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    endsAt: new Date('2027-12-31T23:59:59.000Z').toISOString(),
  });
}

export async function adminEndContest(contestId: string) {
  return adminUpdateContest(contestId, { status: 'ended' });
}

export async function adminUnpublishContest(contestId: string) {
  await ready();
  const contest = await prisma.dsaCodingContest.findUnique({ where: { id: contestId } });
  if (!contest) throw httpError('Contest not found', 404);
  return prisma.dsaCodingContest.update({
    where: { id: contestId },
    data: { status: 'draft', isPublished: false },
    select: { id: true, slug: true, title: true, status: true, isPublished: true },
  });
}
