import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { getPrismaDb } from '@/lib/server-auth-prisma';
import { useAwsStack } from '@/lib/aws/stack';
import { rateLimitInMemory, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z.object({
  answers: z.record(z.unknown()),
  currentQuestionIndex: z.number().int().min(0).optional(),
  timeRemaining: z.number().int().min(0).optional(),
});

type RouteCtx = { params: Promise<{ attemptId: string }> };

export async function POST(request: Request, context: RouteCtx) {
  const rl = rateLimitInMemory(`autosave:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many autosave requests' }, { status: 429 });
  }

  const auth = await requireAuth(['student', 'admin'], request);
  if ('response' in auth) return auth.response;

  const { attemptId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid autosave payload' }, { status: 400 });
  }

  if (!useAwsStack()) {
    const db = auth.ctx.db;
    if (!db) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const { data: row, error: fetchErr } = await db
      .from('test_attempts')
      .select('id, user_id, status')
      .eq('id', attemptId)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }
    if (String(row.user_id) !== auth.ctx.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (row.status === 'completed' || row.status === 'submitted') {
      return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
    }

    const { error } = await db
      .from('test_attempts')
      .update({
        answers: parsed.data.answers,
        proctor_metadata: {
          draft: {
            currentQuestionIndex: parsed.data.currentQuestionIndex,
            timeRemaining: parsed.data.timeRemaining,
            autosavedAt: new Date().toISOString(),
          },
        },
      })
      .eq('id', attemptId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  }

  const prisma = getPrismaDb();
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, userId: true, status: true },
  });

  if (!attempt) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }
  if (attempt.userId !== auth.ctx.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (attempt.status === 'completed' || attempt.status === 'submitted') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

  await prisma.testAttempt.update({
    where: { id: attemptId },
    data: {
      answers: parsed.data.answers as object,
      proctorMetadata: {
        draft: {
          currentQuestionIndex: parsed.data.currentQuestionIndex,
          timeRemaining: parsed.data.timeRemaining,
          autosavedAt: new Date().toISOString(),
        },
      },
    },
  });

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
