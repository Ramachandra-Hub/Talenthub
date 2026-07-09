import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';

type InputQuestion = Record<string, unknown>;

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

function safeTopicNameFromSlug(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return slug;
  return cleaned.replace(/\b\w/g, (m) => m.toUpperCase());
}

function mapInsertRow(row: InputQuestion) {
  const options = Array.isArray(row.options) ? row.options.map((v) => String(v)) : null;
  return {
    question_text: String(row.question_text ?? '').trim(),
    category_id: row.category_id ? String(row.category_id) : null,
    difficulty: row.difficulty ?? 'medium',
    type: row.type ?? 'MCQ',
    options,
    option_a: row.option_a ?? (options?.[0] ?? null),
    option_b: row.option_b ?? (options?.[1] ?? null),
    option_c: row.option_c ?? (options?.[2] ?? null),
    option_d: row.option_d ?? (options?.[3] ?? null),
    correct_answer: String(row.correct_answer ?? '').trim(),
    explanation: row.explanation ?? null,
    tags: normalizeTags(row.tags),
  };
}

async function attachTagLinks(
  db: ReturnType<typeof getDbService>,
  insertedRows: { id: string | number | null; tags: string[] }[],
) {
  const allSlugs = [...new Set(insertedRows.flatMap((r) => r.tags))];
  if (!allSlugs.length) return;

  const { data: existingTags, error: existingErr } = await db
    .from('question_tags')
    .select('id, slug')
    .in('slug', allSlugs);
  if (existingErr) throw new Error(existingErr.message);

  const existingBySlug = new Map<string, string>(
    (existingTags ?? []).map((t) => [String(t.slug), String(t.id)]),
  );

  const missing = allSlugs.filter((slug) => !existingBySlug.has(slug));
  if (missing.length) {
    const payload = missing.map((slug) => ({
      slug,
      name: safeTopicNameFromSlug(slug),
    }));
    const { error: createTagErr } = await db.from('question_tags').insert(payload);
    if (createTagErr) throw new Error(createTagErr.message);

    const { data: createdTags, error: createdErr } = await db
      .from('question_tags')
      .select('id, slug')
      .in('slug', missing);
    if (createdErr) throw new Error(createdErr.message);
    for (const tag of createdTags ?? []) {
      existingBySlug.set(String(tag.slug), String(tag.id));
    }
  }

  const links: { question_id: string; tag_id: string }[] = [];
  for (const row of insertedRows) {
    if (row.id == null) continue;
    const questionId = String(row.id);
    for (const slug of row.tags) {
      const tagId = existingBySlug.get(slug);
      if (tagId) links.push({ question_id: questionId, tag_id: tagId });
    }
  }
  if (!links.length) return;

  const { error: linkErr } = await db
    .from('question_tag_links')
    .upsert(links, { onConflict: 'question_id,tag_id', ignoreDuplicates: true });
  if (linkErr) throw new Error(linkErr.message);
}

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

  if (
    body &&
    typeof body === 'object' &&
    'backfillTagLinks' in body &&
    (body as { backfillTagLinks?: unknown }).backfillTagLinks === true
  ) {
    const tagSlug =
      typeof (body as { tagSlug?: unknown }).tagSlug === 'string'
        ? String((body as { tagSlug?: string }).tagSlug).trim().toLowerCase()
        : '';

    const { data: rows, error } = await db
      .from('questions')
      .select('id, tags')
      .neq('tags', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const candidates = (rows ?? [])
      .map((r) => ({
        id: r.id as string | number | null,
        tags: normalizeTags(r.tags),
      }))
      .filter((r) => (tagSlug ? r.tags.includes(tagSlug) : r.tags.length > 0));

    try {
      await attachTagLinks(db, candidates);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Backfill failed' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, count: candidates.length });
  }

  if (body && typeof body === 'object' && 'questions' in body && Array.isArray((body as { questions: unknown }).questions)) {
    const rows = (body as { questions: InputQuestion[] }).questions
      .map(mapInsertRow)
      .filter((r) => r.question_text && r.correct_answer);
    if (!rows.length) {
      return NextResponse.json({ error: 'No valid questions to import' }, { status: 400 });
    }

    const { data, error } = await db
      .from('questions')
      .insert(rows)
      .select('id, tags');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await attachTagLinks(
        db,
        (data ?? []).map((r) => ({
          id: r.id as string | number | null,
          tags: normalizeTags(r.tags),
        })),
      );
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : 'Could not create topic links',
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, count: rows.length });
  }

  const row = mapInsertRow(body as InputQuestion);
  if (!row.question_text || !row.correct_answer) {
    return NextResponse.json({ error: 'question_text and correct_answer are required' }, { status: 400 });
  }

  const { data, error } = await db.from('questions').insert(row).select('id, tags').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await attachTagLinks(db, [
      {
        id: data?.id as string | number | null,
        tags: normalizeTags(data?.tags),
      },
    ]);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Could not create topic links',
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
