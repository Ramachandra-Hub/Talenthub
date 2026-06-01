import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { publishRmsetPaper } from '@/lib/rmset/publish-paper';
import type { RmsetPaperWithTopics, RmsetTopic } from '@/lib/rmset/types';
import { buildSyllabusCatalogForGroup } from '@/lib/exam-builder/build-syllabus-catalog';
import { rmsetPapersMigrationHint } from '@/lib/db-migration-hints';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let catalogTopics: Awaited<ReturnType<typeof buildSyllabusCatalogForGroup>> = [];
  try {
    catalogTopics = await buildSyllabusCatalogForGroup(admin, 'rmset');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load RMSET topics';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const topics: RmsetTopic[] = catalogTopics.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    question_count: t.question_count,
  }));

  const { data: papers, error: papersErr } = await admin
    .from('rmset_papers')
    .select('*')
    .order('updated_at', { ascending: false });

  if (papersErr) {
    const msg = papersErr.message ?? '';
    if (msg.includes('rmset_papers') && (msg.includes('schema cache') || msg.includes('does not exist'))) {
      return NextResponse.json({
        topics,
        papers: [],
        warning: 'Run prisma db push or scripts/01-initial-schema.sql on RDS.'
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const tagMap = new Map(topics.map((t) => [t.id, t]));
  const tagMapBySlug = new Map(topics.map((t) => [t.slug, t]));
  const enriched: RmsetPaperWithTopics[] = (papers ?? []).map((p) => {
    const topicIds = (p.topic_ids ?? []) as string[];
    const selected = topicIds
      .map((id) => tagMap.get(id) ?? tagMapBySlug.get(id))
      .filter(Boolean) as RmsetTopic[];
    return {
      ...(p as RmsetPaperWithTopics),
      topics: selected,
      total_questions: topicIds.length * (p.questions_per_topic as number),
    };
  });

  return NextResponse.json({ topics, papers: enriched });
}

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

  const topicIds = Array.isArray(body.topicIds) ? (body.topicIds as string[]) : [];
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  try {
    const result = await publishRmsetPaper(admin, {
      title,
      description: typeof body.description === 'string' ? body.description : undefined,
      topicIds,
      questionsPerTopic: Number(body.questionsPerTopic) || 10,
      durationMinutes: Number(body.durationMinutes) || 60,
      createdBy: auth.ctx.user.id,
      paperId: typeof body.paperId === 'string' ? body.paperId : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    const hint = rmsetPapersMigrationHint(message);
    return NextResponse.json(
      {
        error: hint ?? message,
        hint:
          message.includes('No questions found') || message.includes('not found')
            ? 'Tag MCQs in the question bank for each selected topic (Load topic bank), then publish again.'
            : undefined,
      },
      { status: 400 },
    );
  }
}
