import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { drawExamQuestionsFromTopics } from '@/lib/exam-builder/draw-questions';
import { getExamBuilderTestType } from '@/lib/exam-builder/test-catalog';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const testType = String(body.testType ?? '');
  const def = getExamBuilderTestType(testType);
  if (!def) {
    return NextResponse.json({ error: 'Invalid test type' }, { status: 400 });
  }
  if (def.id === 'department-manual') {
    return NextResponse.json({ error: 'Manual exams use the question editor directly' }, { status: 400 });
  }

  const topicIds = Array.isArray(body.topicIds) ? (body.topicIds as string[]) : [];
  const slotKey = String(body.slotKey ?? 'slot-1');
  const questionsPerTopic = Math.min(
    50,
    Math.max(1, Number(body.questionsPerTopic) || def.defaultQuestionsPerTopic),
  );

  try {
    const result = await drawExamQuestionsFromTopics(admin, {
      testType,
      topicIds,
      questionsPerTopic,
      slotKey,
      createdBy: auth.ctx.user.id,
    });

    return NextResponse.json({
      questions: result.questions,
      total: result.questions.length,
      topicsUsed: result.topicsUsed,
      warnings: result.warnings,
      drawId: result.drawId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not build question paper';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
