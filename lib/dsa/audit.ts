import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function writeDsaAudit(
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.dsaAuditEvent.create({
      data: {
        userId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn('[dsa-audit]', eventType, err);
  }
}
