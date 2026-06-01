import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { seedCuratedQuestionBankPrisma } from '@/lib/question-bank/seed-curated-bank-prisma';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body ok */
  }

  const questionsPerTopic = Math.min(
    200,
    Math.max(10, Number(body.questionsPerTopic) || 150),
  );

  try {
    const result = await seedCuratedQuestionBankPrisma({
      questionsPerTopic,
      replaceExisting: body.replaceExisting !== false,
    });
    return NextResponse.json({
      ok: true,
      message: `Loaded ${result.questionsInserted} topic-wise MCQs across ${result.tagsEnsured} syllabus tags.`,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not seed question bank';
    const isClient =
      message.includes('Invalid') ||
      message.includes('questionsPerTopic') ||
      message.includes('Unauthorized');
    return NextResponse.json(
      {
        error: message,
        hint: isClient
          ? undefined
          : 'Ensure RDS schema is applied (pnpm init:rds or POST /api/setup/rds). Check DATABASE_URL on Vercel.',
      },
      { status: isClient ? 400 : 500 },
    );
  }
}
