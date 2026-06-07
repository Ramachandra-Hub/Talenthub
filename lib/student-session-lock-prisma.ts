import { prisma } from '@/lib/prisma';
import { normalizeStudentRoll, STUDENT_SESSION_STALE_MS } from '@/lib/student-session-lock';

export type ClaimStudentSessionResult = { ok: true; lockActive: boolean };

async function purgeStaleSessions(now = Date.now()): Promise<void> {
  const cutoff = new Date(now - STUDENT_SESSION_STALE_MS);
  await prisma.studentActiveSession.deleteMany({
    where: { lastHeartbeat: { lt: cutoff } },
  });
}

export async function claimStudentSessionPrisma(
  rollNumber: string,
  userId: string,
  sessionId: string,
  now = Date.now(),
): Promise<ClaimStudentSessionResult> {
  const roll = normalizeStudentRoll(rollNumber);
  if (!roll || !userId || !sessionId) {
    return { ok: true, lockActive: false };
  }

  try {
    await purgeStaleSessions(now);

    const conflicting = await prisma.studentActiveSession.findFirst({
      where: {
        user: {
          OR: [{ rollNumber: roll }, { rollNumber: roll.replace(/\s+/g, '') }],
        },
        NOT: { sessionId },
      },
      select: { userId: true, sessionId: true },
    });
    if (conflicting) {
      return { ok: true, lockActive: false };
    }

    await prisma.studentActiveSession.upsert({
      where: { userId },
      create: {
        userId,
        sessionId,
        lockedAt: new Date(now),
        lastHeartbeat: new Date(now),
      },
      update: {
        sessionId,
        lastHeartbeat: new Date(now),
      },
    });

    return { ok: true, lockActive: true };
  } catch (err) {
    console.error('[student-session-lock-prisma] lock failed — allowing login (fail-open):', err);
    return { ok: true, lockActive: true };
  }
}

export async function touchStudentSessionPrisma(userId: string, sessionId?: string): Promise<void> {
  if (!userId) return;
  const now = new Date();
  const sid = sessionId?.trim() || userId;
  try {
    await prisma.studentActiveSession.upsert({
      where: { userId },
      create: {
        userId,
        sessionId: sid,
        lockedAt: now,
        lastHeartbeat: now,
      },
      update: {
        lastHeartbeat: now,
        sessionId: sid,
      },
    });
  } catch (err) {
    console.warn('[student-session-lock-prisma] heartbeat upsert failed:', err);
  }
}

export async function releaseStudentSessionPrisma(
  userId: string,
  sessionId?: string | null,
): Promise<void> {
  if (!userId) return;
  try {
    await prisma.studentActiveSession.deleteMany({
      where: sessionId ? { userId, sessionId } : { userId },
    });
  } catch (err) {
    console.warn('[student-session-lock-prisma] release skipped:', err);
  }
}

/** @deprecated Use createStudentSessionId() per login — kept for legacy callers. */
export function nextAuthSessionId(tokenSub: string): string {
  return tokenSub;
}
