import { prisma } from '@/lib/prisma';
import type { CompletedAttemptSummary } from '@/lib/test-attempts';
import { roundScorePercent } from '@/lib/format-score';

export type ScheduleAttemptContext = {
  scheduleId: string;
  slotNumber: number | null;
  attemptRound: number;
};

export function normalizeAttemptRound(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function formatAttemptRoundLabel(round: number): string {
  return `Attempt ${normalizeAttemptRound(round)}`;
}

export function formatSlotAttemptLabel(
  slotNumber: number | null | undefined,
  attemptRound: number | null | undefined,
  title?: string | null,
): string {
  const parts: string[] = [];
  if (title?.trim()) parts.push(title.trim());
  if (slotNumber != null && Number.isFinite(slotNumber)) {
    parts.push(`Slot ${Math.floor(slotNumber)}`);
  }
  parts.push(formatAttemptRoundLabel(attemptRound ?? 1));
  return parts.join(' · ');
}

function toCompletedSummary(row: {
  id: string;
  percentageScore: unknown;
  score: unknown;
  completedAt: Date | null;
}): CompletedAttemptSummary {
  const pct = row.percentageScore != null ? Number(row.percentageScore) : null;
  const score = row.score != null ? Number(row.score) : null;
  const resolved =
    pct != null && Number.isFinite(pct) ? roundScorePercent(pct) : score != null && Number.isFinite(score) ? roundScorePercent(score) : 0;
  return {
    id: row.id,
    score: resolved,
    completed_at: row.completedAt?.toISOString() ?? null,
  };
}

/** Prior completed sitting for this schedule (one official submit per schedule). */
export async function findCompletedAttemptForSchedulePrisma(
  userId: string,
  scheduleId: string,
): Promise<CompletedAttemptSummary | null> {
  const id = scheduleId.trim();
  if (!id) return null;

  const row = await prisma.testAttempt.findFirst({
    where: {
      userId,
      scheduleId: id,
      status: { in: ['completed', 'submitted'] },
    },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      percentageScore: true,
      score: true,
      completedAt: true,
    },
  });

  if (!row) return null;
  return toCompletedSummary(row);
}

export async function loadScheduleAttemptContext(
  scheduleId: string,
): Promise<ScheduleAttemptContext | null> {
  const row = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, slotNumber: true, attemptRound: true },
  });
  if (!row) return null;
  return {
    scheduleId: row.id,
    slotNumber: row.slotNumber,
    attemptRound: normalizeAttemptRound(row.attemptRound),
  };
}
