import { prisma } from '@/lib/prisma';
import { ensureDsaCurriculum } from '@/lib/dsa/ensure-curriculum';
import { DSA_PROGRAM_SLUG } from '@/lib/dsa/curriculum';
import { evaluateDsaDayAccessForUser } from '@/lib/dsa/service';
import { assertUserAssignedToDsa } from '@/lib/dsa/roster';

export type MissionCodeLabTarget = {
  missionKey: string;
  dayId: string | null;
  href: `/dsa/day/${string}` | null;
  focusProblemId: string | null;
  focusProblemSlug: string | null;
  mappingSource: 'authoritative' | 'none';
  accessible: boolean;
  reason: string | null;
};

/**
 * Pure access decision for journey mapping (unit-testable).
 * Does not mutate day progress or assign problems.
 */
export function evaluateJourneyDayAccess(input: {
  mappingActive: boolean;
  dayExists: boolean;
  rosterOk: boolean;
  weekUnlocked: boolean;
  hasActiveAttempt: boolean;
  dayProgressStatus: string | null;
}): { accessible: boolean; reason: string | null } {
  if (!input.mappingActive) {
    return { accessible: false, reason: 'Mission mapping is inactive.' };
  }
  if (!input.dayExists) {
    return { accessible: false, reason: 'Mapped DSA day no longer exists.' };
  }
  if (!input.rosterOk) {
    return { accessible: false, reason: 'DSA practice is not assigned to your roll number.' };
  }
  if (!input.weekUnlocked) {
    return { accessible: false, reason: 'Complete the previous week before opening this mission.' };
  }
  if (!input.hasActiveAttempt) {
    return { accessible: false, reason: 'No active DSA attempt for this week.' };
  }
  if (!input.dayProgressStatus) {
    return { accessible: false, reason: 'Day is not part of this attempt.' };
  }
  if (input.dayProgressStatus === 'locked') {
    return {
      accessible: false,
      reason: 'This DSA day is still locked. Complete the previous day first.',
    };
  }
  return { accessible: true, reason: null };
}

/**
 * Focus problem is actionable only when assigned on THIS student's day progress.
 * Never bypasses dsa_day_assignments.
 */
export function resolveFocusProblemId(input: {
  focusProblemSlug: string | null | undefined;
  problemIdBySlug: Map<string, string>;
  assignedProblemIds: Set<string>;
}): string | null {
  const slug = input.focusProblemSlug?.trim();
  if (!slug) return null;
  const problemId = input.problemIdBySlug.get(slug);
  if (!problemId) return null;
  if (!input.assignedProblemIds.has(problemId)) return null;
  return problemId;
}

function unresolved(missionKey: string, reason: string): MissionCodeLabTarget {
  return {
    missionKey,
    dayId: null,
    href: null,
    focusProblemId: null,
    focusProblemSlug: null,
    mappingSource: 'none',
    accessible: false,
    reason,
  };
}

/**
 * Authoritative mission_key → Code Lab target.
 * Fail-closed: no dayNumberHint / title / first-available / /dsa fallbacks.
 */
export async function resolveJourneyMissionForStudent(
  userId: string,
  missionKeyRaw: string,
): Promise<MissionCodeLabTarget> {
  const missionKey = missionKeyRaw.trim();
  if (!missionKey) {
    return unresolved('', 'Mission key is required.');
  }

  // Curriculum ensure also seeds authoritative journey mappings.
  await ensureDsaCurriculum();
  const { ensureDsaJourneyMissionsTable, isMissingDsaTableError } = await import(
    '@/lib/dsa/ensure-tables'
  );
  await ensureDsaJourneyMissionsTable();

  let mapping: Awaited<ReturnType<typeof prisma.dsaJourneyMission.findUnique>> = null;
  try {
    mapping = await prisma.dsaJourneyMission.findUnique({
      where: { missionKey },
    });
  } catch (err) {
    if (!isMissingDsaTableError(err)) throw err;
    await ensureDsaJourneyMissionsTable();
    mapping = await prisma.dsaJourneyMission.findUnique({
      where: { missionKey },
    });
  }

  if (!mapping) {
    return unresolved(missionKey, 'Mission is not connected to a coding workspace yet.');
  }

  if (!mapping.isActive) {
    return {
      ...unresolved(missionKey, 'Mission mapping is inactive.'),
      focusProblemSlug: mapping.focusProblemSlug,
    };
  }

  const day = await prisma.dsaDay.findUnique({
    where: { id: mapping.dayId },
    select: { id: true },
  });
  if (!day) {
    return unresolved(missionKey, 'Mapped DSA day no longer exists.');
  }

  const dayId = day.id;
  const href = `/dsa/day/${dayId}` as const;

  try {
    await assertUserAssignedToDsa(userId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Not authorized for DSA.';
    return {
      missionKey,
      dayId,
      href,
      focusProblemId: null,
      focusProblemSlug: mapping.focusProblemSlug,
      mappingSource: 'authoritative',
      accessible: false,
      reason,
    };
  }

  const access = await evaluateDsaDayAccessForUser(userId, dayId, 'official');

  // Focus problem: never actionable unless assigned on this student's day attempt.
  let focusProblemId: string | null = null;
  if (mapping.focusProblemSlug && access.accessible) {
    const problem = await prisma.dsaProblem.findUnique({
      where: { slug: mapping.focusProblemSlug },
      select: { id: true },
    });
    if (problem) {
      const enrollment = await prisma.dsaEnrollment.findFirst({
        where: { userId, program: { slug: DSA_PROGRAM_SLUG }, status: 'active' },
        select: { id: true },
      });
      if (enrollment) {
        const progress = await prisma.dsaDayProgress.findFirst({
          where: {
            dayId,
            weekAttempt: {
              enrollmentId: enrollment.id,
              kind: 'official',
              isActive: true,
            },
          },
          select: { id: true },
        });
        if (progress) {
          const assigned = await prisma.dsaDayAssignment.findFirst({
            where: { dayProgressId: progress.id, problemId: problem.id },
            select: { id: true },
          });
          if (assigned) focusProblemId = problem.id;
        }
      }
    }
  }

  return {
    missionKey,
    dayId,
    href,
    focusProblemId,
    focusProblemSlug: mapping.focusProblemSlug,
    mappingSource: 'authoritative',
    accessible: access.accessible,
    reason: access.reason,
  };
}
