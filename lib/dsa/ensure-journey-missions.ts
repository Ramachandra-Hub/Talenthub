import { prisma } from '@/lib/prisma';
import {
  ensureDsaTables,
  ensureDsaJourneyMissionsTable,
  isMissingDsaTableError,
} from '@/lib/dsa/ensure-tables';
import { DSA_PROGRAM_SLUG } from '@/lib/dsa/curriculum';
import { DSA_JOURNEY_MISSION_SEEDS } from '@/lib/dsa/journey-mission-seeds';

/**
 * Upsert explicit journey mappings by resolving real day UUIDs from
 * (week.topic_slug, day.day_number). Never invents day IDs.
 */
export async function ensureJourneyMissionMappings(): Promise<void> {
  await ensureDsaTables();
  await ensureDsaJourneyMissionsTable();

  const program = await prisma.dsaProgram.findUnique({
    where: { slug: DSA_PROGRAM_SLUG },
    select: { id: true },
  });
  if (!program) return;

  const level = await prisma.dsaLevel.findFirst({
    where: { programId: program.id, slug: 'level-1' },
    select: { id: true },
  });
  if (!level) return;

  for (const seed of DSA_JOURNEY_MISSION_SEEDS) {
    const week = await prisma.dsaWeek.findFirst({
      where: { levelId: level.id, topicSlug: seed.weekTopicSlug },
      select: { id: true },
    });
    if (!week) continue;

    const day = await prisma.dsaDay.findUnique({
      where: { weekId_dayNumber: { weekId: week.id, dayNumber: seed.dayNumber } },
      select: { id: true },
    });
    if (!day) continue;

    const payload = {
      topicKey: seed.topicKey,
      dayId: day.id,
      focusProblemSlug: seed.focusProblemSlug ?? null,
      sortOrder: seed.sortOrder,
      isActive: seed.isActive ?? true,
    };

    try {
      await prisma.dsaJourneyMission.upsert({
        where: { missionKey: seed.missionKey },
        create: { missionKey: seed.missionKey, ...payload },
        update: payload,
      });
    } catch (err) {
      if (!isMissingDsaTableError(err)) throw err;
      await ensureDsaJourneyMissionsTable();
      await prisma.dsaJourneyMission.upsert({
        where: { missionKey: seed.missionKey },
        create: { missionKey: seed.missionKey, ...payload },
        update: payload,
      });
    }
  }
}
