import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { resolveSyllabusTopicsForBuilder } from '@/lib/exam-builder/draw-questions';
import { MCQ_UPLOAD_FORMAT_HINT } from '@/lib/exam-builder/parse-exam-text';
import {
  extractTextFromUpload,
  parseMcqCsv,
  parseMcqPlainText,
} from '@/lib/question-bank/parse-upload-content';
import { attachPoolTestIdToRows } from '@/lib/question-bank/ensure-bank-test';
import { ensureBankSchemaReady } from '@/lib/question-bank/ensure-bank-schema-ready';
import { mcqToQuestionRow } from '@/lib/question-bank/questions-insert-shape';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form' }, { status: 400 });
  }

  const file = form.get('file');
  const tagIdsRaw = form.get('tagIds');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }

  if (typeof tagIdsRaw !== 'string') {
    return NextResponse.json({ error: 'tagIds (JSON array) is required.' }, { status: 400 });
  }

  let tagIds: string[];
  try {
    const parsed = JSON.parse(tagIdsRaw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
      throw new Error('bad shape');
    }
    tagIds = parsed;
  } catch {
    return NextResponse.json({ error: 'tagIds must be a JSON array of topic ids.' }, { status: 400 });
  }

  if (tagIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one syllabus topic to tag uploaded questions.' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 8 MB.' }, { status: 400 });
  }

  const categoryIdRaw = form.get('categoryId');
  const categoryId =
    typeof categoryIdRaw === 'string' && categoryIdRaw.trim() ? categoryIdRaw.trim() : null;

  const name = file.name.toLowerCase();
  let parsedPaper: ReturnType<typeof parseMcqCsv>;

  let extractedText = '';

  try {
    if (name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel') {
      const text = await file.text();
      extractedText = text;
      parsedPaper = parseMcqCsv(text);
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { text, format } = await extractTextFromUpload(buffer, file.name, file.type);
      extractedText = text;
      parsedPaper = parseMcqPlainText(text, format);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read file';
    return NextResponse.json({ error: message, formatHint: MCQ_UPLOAD_FORMAT_HINT }, { status: 400 });
  }

  const { questions, warnings } = parsedPaper;
  if (questions.length === 0) {
    return NextResponse.json(
      {
        error: 'No MCQs could be extracted. Use CSV for best results, or format PDF/Word as numbered questions with A–D options.',
        warnings,
        textPreview: extractedText.slice(0, 500),
        charsExtracted: extractedText.length,
        formatHint: MCQ_UPLOAD_FORMAT_HINT,
      },
      { status: 422 },
    );
  }

  let resolved;
  try {
    resolved = await resolveSyllabusTopicsForBuilder(admin, tagIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid syllabus tags';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { shape } = await ensureBankSchemaReady(admin);
  const primary = resolved[0];
  const tagJsonbValues = [...new Set([...resolved.map((t) => t.id), ...resolved.map((t) => t.slug)])];

  const rows = questions.map((q) => {
    const base = mcqToQuestionRow(q, shape, {
      tagSlug: primary?.slug ?? 'upload',
      tagId: primary?.id ?? '',
      categoryId: categoryId ?? undefined,
    });
    if (shape.has('tags')) {
      base.tags = tagJsonbValues;
    }
    return base;
  });

  const insertedIds: string[] = [];
  try {
    for (const batch of chunks(rows, 50)) {
      const { rows: withTestId, poolTestId } = await attachPoolTestIdToRows(admin, batch);
      if (poolTestId == null && batch.length > 0) {
        throw new Error(
          'questions.test_id is required but Question Bank Pool test could not be created. Run migration 021_questions_test_id_nullable.sql in AWS RDS.',
        );
      }
      const { data, error } = await admin.from('questions').insert(withTestId).select('id');
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (row.id) insertedIds.push(row.id as string);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database insert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const linkRows = insertedIds.flatMap((question_id) =>
    resolved.map((t) => ({ question_id, tag_id: t.id })),
  );

  const linkBatches = chunks(linkRows, 200);
  for (const batch of linkBatches) {
    const { error: linkErr } = await admin.from('question_tag_links').insert(batch);
    if (linkErr) {
      return NextResponse.json(
        {
          error: `Questions saved but tag links failed: ${linkErr.message}. Tags JSONB on rows may still allow draws.`,
          inserted: insertedIds.length,
          warnings,
        },
        { status: 207 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    inserted: insertedIds.length,
    tagCount: resolved.length,
    warnings: [
      ...warnings,
      `${insertedIds.length} MCQ(s) tagged for: ${resolved.map((t) => t.name).join(', ')}. Use “Draw from bank” to pull them into papers.`,
    ],
  });
}
