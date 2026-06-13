import { prisma } from '@/lib/prisma';
import {
  releaseStudentSessionPrisma,
} from '@/lib/student-session-lock-prisma';
import { STUDENT_SESSION_STALE_MS } from '@/lib/student-session-lock';

export type StudentPortalSessionInfo = {
  active: boolean;
  session_id: string | null;
  locked_at: string | null;
  last_heartbeat: string | null;
};

/** Drop heartbeat rows older than the stale window so status reflects reality. */
export async function purgeStaleStudentPortalSessions(now = Date.now()): Promise<void> {
  const cutoff = new Date(now - STUDENT_SESSION_STALE_MS);
  await prisma.studentActiveSession.deleteMany({
    where: { lastHeartbeat: { lt: cutoff } },
  });
}

export async function getStudentPortalSessionMap(
  userIds: string[],
): Promise<Map<string, StudentPortalSessionInfo>> {
  const map = new Map<string, StudentPortalSessionInfo>();
  if (!userIds.length) return map;

  await purgeStaleStudentPortalSessions();

  const rows = await prisma.studentActiveSession.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      sessionId: true,
      lockedAt: true,
      lastHeartbeat: true,
    },
  });

  for (const row of rows) {
    map.set(row.userId, {
      active: true,
      session_id: row.sessionId,
      locked_at: row.lockedAt.toISOString(),
      last_heartbeat: row.lastHeartbeat.toISOString(),
    });
  }

  for (const id of userIds) {
    if (!map.has(id)) {
      map.set(id, {
        active: false,
        session_id: null,
        locked_at: null,
        last_heartbeat: null,
      });
    }
  }

  return map;
}

/** Admin-only: clear portal session lock so the student can log in again. */
export async function adminReleaseStudentPortalSession(userId: string): Promise<{
  released: boolean;
  hadActiveSession: boolean;
}> {
  await purgeStaleStudentPortalSessions();

  const existing = await prisma.studentActiveSession.findUnique({
    where: { userId },
    select: { userId: true },
  });

  await releaseStudentSessionPrisma(userId);
  return {
    released: true,
    hadActiveSession: Boolean(existing),
  };
}
