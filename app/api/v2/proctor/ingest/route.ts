import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { useAwsStack } from '@/lib/aws/stack';
import {
  ensureExamViolationsTableIfPossible,
  isExamViolationsSchemaError,
} from '@/lib/ensure-exam-violations';
import { requireAuth } from '@/lib/server-auth';
import {
  insertProctorViolationsPrisma,
  linkProctorViolationsPrisma,
} from '@/lib/db/test-attempts-prisma';

const PROCTOR_URL = (process.env.AI_PROCTOR_URL ?? '').replace(/\/$/, '');
const PROCTOR_TOKEN = process.env.INTERNAL_API_TOKEN?.trim() || '';

type IngestItem = {
  type: string;
  metadata?: Record<string, unknown>;
};

function normalizeStoredTestId(testId: string | undefined | null): string | null {
  const value = String(testId ?? '').trim();
  return value || null;
}

async function insertViolationRowsDb(
  admin: NonNullable<ReturnType<typeof getDbService>>,
  rows: Array<{
    user_id: string;
    test_id: string | null;
    attempt_id: string | null;
    violation_type: string;
    metadata: Record<string, unknown>;
  }>,
): Promise<{ ok: boolean; error?: string }> {
  let { error } = await admin.from('exam_violations').insert(rows);

  if (error && isExamViolationsSchemaError(error)) {
    const ensured = await ensureExamViolationsTableIfPossible();
    if (ensured) {
      ({ error } = await admin.from('exam_violations').insert(rows));
    }
  }

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function POST(request: Request) {
  const auth = await requireAuth(['student', 'admin']);
  if ('response' in auth) return auth.response;

  const body = (await request.json()) as {
    testId?: string;
    attemptId?: string;
    sessionId?: string;
    type?: string;
    metadata?: Record<string, unknown>;
    batch?: IngestItem[];
    linkAttempt?: boolean;
  };

  const userId = auth.ctx.user.id;
  const sessionId = body.sessionId ?? body.attemptId ?? body.testId ?? null;

  const items: IngestItem[] = body.batch?.length
    ? body.batch
    : body.type
      ? [{ type: body.type, metadata: body.metadata }]
      : [];

  if (!items.length && !body.linkAttempt) {
    return NextResponse.json({ error: 'type or batch required' }, { status: 400 });
  }

  let stored = 0;

  if (body.linkAttempt && body.attemptId && sessionId) {
    if (useAwsStack()) {
      await linkProctorViolationsPrisma(
        userId,
        body.attemptId,
        body.testId ?? null,
        sessionId,
      );
    } else {
      const admin = getDbService();
      if (admin) {
        await admin
          .from('exam_violations')
          .update({ attempt_id: body.attemptId, test_id: body.testId ?? null })
          .eq('user_id', userId)
          .filter('metadata->>sessionId', 'eq', sessionId);
      }
    }
  }

  if (items.length) {
    const testId = normalizeStoredTestId(body.testId);
    const attemptId = body.attemptId ? String(body.attemptId) : null;
    const rows = items.map((item) => ({
      user_id: userId,
      test_id: testId,
      attempt_id: attemptId,
      violation_type: item.type,
      metadata: {
        ...(item.metadata ?? {}),
        sessionId,
        testId: body.testId ?? testId,
      },
    }));

    if (useAwsStack()) {
      stored = await insertProctorViolationsPrisma(
        rows.map((r) => ({
          userId: r.user_id,
          testId: r.test_id,
          attemptId: r.attempt_id,
          violationType: r.violation_type,
          metadata: r.metadata,
        })),
      );
    } else {
      const admin = getDbService();
      if (admin) {
        const inserted = await insertViolationRowsDb(admin, rows);
        if (!inserted.ok) {
          return NextResponse.json(
            { error: inserted.error ?? 'Insert failed', stored: 0 },
            { status: 500 },
          );
        }
        stored = rows.length;
      }
    }

    void Promise.allSettled(
      PROCTOR_URL && PROCTOR_TOKEN
        ? items.map((item) =>
            fetch(`${PROCTOR_URL}/v1/signals`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-token': PROCTOR_TOKEN,
              },
              body: JSON.stringify({
                examSessionId: sessionId ?? 'unknown',
                userId,
                type: item.type,
                metadata: { ...(item.metadata ?? {}), testId: body.testId },
              }),
            }),
          )
        : [],
    );
  }

  return NextResponse.json({ ok: true, stored: stored || items.length });
}
