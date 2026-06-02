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
    console.warn('[student-session-lock-prisma] lock failed — allowing login:', err);
    return { ok: true, lockActive: false };
  }
}

export async function touchStudentSessionPrisma(userId: string, _sessionId?: string): Promise<void> {
  if (!userId) return;
  await prisma.studentActiveSession.updateMany({
    where: { userId },
    data: { lastHeartbeat: new Date() },
  });
}

export async function releaseStudentSessionPrisma(
  userId: string,
  sessionId?: string | null,
): Promise<void> {
  if (!userId) return;
  await prisma.studentActiveSession.deleteMany({
    where: sessionId ? { userId, sessionId } : { userId },
  });
}

export function nextAuthSessionId(tokenSub: string, issuedAt?: number): string {
  return `${tokenSub}`;
}
