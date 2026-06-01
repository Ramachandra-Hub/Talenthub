import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = auth.ctx.db;

  if (body && typeof body === 'object' && 'questions' in body && Array.isArray((body as { questions: unknown }).questions)) {
    const rows = (body as { questions: Record<string, unknown>[] }).questions;
    const { error } = await db.from('questions').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: rows.length });
  }

  const row = body as Record<string, unknown>;
  const { error } = await db.from('questions').insert({
    question_text: row.question_text,
    category_id: row.category_id,
    difficulty: row.difficulty ?? 'medium',
    type: row.type ?? 'MCQ',
    options: row.options ?? null,
    correct_answer: row.correct_answer,
    explanation: row.explanation ?? null,
    tags: row.tags ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
