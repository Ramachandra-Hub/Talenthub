import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { autoEnsureRdsSchema } from '@/lib/db/auto-ensure-rds';
import { publishJavaTodayExam } from '@/lib/admin/publish-java-today-exam';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const schema = await autoEnsureRdsSchema();
  if (!schema.ok && !schema.skipped) {
    return NextResponse.json(
      {
        error: schema.message,
        hint: schema.detail ?? 'Run POST /api/setup/rds against your DATABASE_URL.',
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === 'string' ? body.action : 'publish';
  const allowRewrite = action === 'rewrite' || action === 'open_retake' || Boolean(body.allowRewrite);

  try {
    const result = await publishJavaTodayExam({
      adminUserId: auth.ctx.user.id,
      allowRewrite,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[java-exam-today]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not publish Java exam' },
      { status: 400 },
    );
  }
}
