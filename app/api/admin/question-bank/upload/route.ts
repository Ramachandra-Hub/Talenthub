import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import {
  extractTextFromUpload,
  parseMcqCsv,
  parseMcqPlainText,
} from '@/lib/question-bank/parse-upload-content';
import { MCQ_UPLOAD_FORMAT_HINT } from '@/lib/exam-builder/parse-exam-text';
import {
  parseCodingUploadText,
  parseCodingProblemsPlainText,
  CODING_UPLOAD_FORMAT_HINT,
} from '@/lib/exam-builder/parse-coding-upload';
import {
  insertCodingProblemsIntoBank,
  ensureCodingBankTags,
  type CodingBankLanguage,
} from '@/lib/coding/coding-bank-store';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { isFacultyMcqQuestion } from '@/lib/faculty-exams';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

function isCodingTopic(slug: string): boolean {
  return slug === 'coding-problems' || slug.startsWith('coding-');
}

function languageFromSlug(slug: string, fallback: CodingBankLanguage): CodingBankLanguage {
  if (slug.includes('java') || slug === 'technical-java') return 'java';
  if (slug.includes('python')) return 'python';
  if (slug.includes('coding-c') || slug.endsWith('-c')) return 'c';
  return fallback;
}

async function ensureTopicTag(slug: string, name?: string) {
  const existing = await prisma.questionTag.findUnique({ where: { slug } });
  if (existing) return existing;
  const label =
    name?.trim() ||
    slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return prisma.questionTag.create({ data: { slug, name: label } });
}

async function insertMcqsForTopic(
  questions: FacultyExamQuestion[],
  topicSlug: string,
  topicName?: string,
): Promise<number> {
  const tag = await ensureTopicTag(topicSlug, topicName);
  let inserted = 0;
  for (const q of questions) {
    if (!isFacultyMcqQuestion(q)) continue;
    const row = await prisma.question.create({
      data: {
        questionText: q.question_text,
        questionType: 'MCQ',
        type: 'MCQ',
        difficulty: 'medium',
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        options: [q.option_a, q.option_b, q.option_c, q.option_d],
        correctAnswer: q.correct_answer,
        explanation: q.explanation ?? null,
        tags: [topicSlug],
        marks: 1,
      },
      select: { id: true },
    });
    await prisma.questionTagLink.createMany({
      data: [{ questionId: row.id, tagId: tag.id }],
      skipDuplicates: true,
    });
    inserted += 1;
  }
  return inserted;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form' }, { status: 400 });
  }

  const file = form.get('file');
  const pasteText = String(form.get('pasteText') ?? '').trim();
  const topicSlug = String(form.get('topicSlug') ?? '').trim().toLowerCase();
  const topicName = String(form.get('topicName') ?? '').trim();
  const kindRaw = String(form.get('kind') ?? 'auto').trim().toLowerCase();
  const kind = kindRaw === 'mcq' || kindRaw === 'coding' ? kindRaw : 'auto';
  const langRaw = String(form.get('defaultLanguage') ?? '').trim().toLowerCase();
  const defaultLanguage: CodingBankLanguage =
    langRaw === 'java' || langRaw === 'python' || langRaw === 'c'
      ? langRaw
      : languageFromSlug(topicSlug, 'java');

  if (!topicSlug) {
    return NextResponse.json(
      {
        error:
          'Select a topic first (for Java MCQs choose “Java Programming”; for coding choose “Coding — Java”).',
      },
      { status: 400 },
    );
  }

  if (!(file instanceof File) && !pasteText) {
    return NextResponse.json({ error: 'Choose a CSV/PDF file or paste questions.' }, { status: 400 });
  }

  if (file instanceof File && file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 8 MB.' }, { status: 400 });
  }

  const name = file instanceof File ? file.name.toLowerCase() : 'paste.txt';
  let extractedText = '';
  let format: 'csv' | 'pdf' | 'docx' | 'text' = 'text';

  try {
    if (pasteText) {
      extractedText = pasteText;
      format = 'text';
    } else if (file instanceof File) {
      if (
        name.endsWith('.csv') ||
        file.type === 'text/csv' ||
        file.type === 'application/vnd.ms-excel'
      ) {
        extractedText = await file.text();
        format = 'csv';
      } else if (name.endsWith('.json')) {
        extractedText = await file.text();
        format = 'text';
      } else {
        const buffer = Buffer.from(await file.arrayBuffer());
        const extracted = await extractTextFromUpload(buffer, file.name, file.type);
        extractedText = extracted.text;
        format = extracted.format;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read file';
    return NextResponse.json(
      { error: message, formatHint: `${MCQ_UPLOAD_FORMAT_HINT}\n\n${CODING_UPLOAD_FORMAT_HINT}` },
      { status: 400 },
    );
  }

  if (!extractedText.trim()) {
    return NextResponse.json(
      {
        error:
          'No text could be read. Use a text-based PDF (not a scanned photo), CSV, Word, or paste the questions.',
      },
      { status: 422 },
    );
  }

  const preferCoding = kind === 'coding' || (kind === 'auto' && isCodingTopic(topicSlug));
  const mcqParsed =
    format === 'csv' ? parseMcqCsv(extractedText) : parseMcqPlainText(extractedText, format);
  const codingParsed =
    format === 'csv'
      ? parseCodingUploadText(extractedText, name.endsWith('.csv') ? 'upload.csv' : 'upload.txt', defaultLanguage)
      : parseCodingProblemsPlainText(extractedText, defaultLanguage);

  const useCoding =
    kind === 'coding' ||
    (kind !== 'mcq' && preferCoding && codingParsed.problems.length > 0 && mcqParsed.questions.length === 0) ||
    (kind === 'auto' && mcqParsed.questions.length === 0 && codingParsed.problems.length > 0);

  try {
    if (useCoding) {
      if (!codingParsed.problems.length) {
        return NextResponse.json(
          {
            error: 'No coding problems found in this file.',
            warnings: [...codingParsed.warnings, ...mcqParsed.warnings],
            textPreview: extractedText.slice(0, 500),
            charsExtracted: extractedText.length,
            formatHint: CODING_UPLOAD_FORMAT_HINT,
          },
          { status: 422 },
        );
      }
      await ensureCodingBankTags();
      const inserted = await insertCodingProblemsIntoBank(codingParsed.problems, defaultLanguage);
      const extraTag = await ensureTopicTag(topicSlug, topicName);
      if (extraTag.slug !== 'coding-problems' && !extraTag.slug.startsWith('coding-')) {
        await prisma.questionTagLink.createMany({
          data: inserted.map((p) => ({ questionId: p.id, tagId: extraTag.id })),
          skipDuplicates: true,
        });
      }
      return NextResponse.json({
        ok: true,
        kind: 'coding',
        inserted: inserted.length,
        language: defaultLanguage,
        warnings: codingParsed.warnings,
        message: `Saved ${inserted.length} ${defaultLanguage.toUpperCase()} coding problem(s) to the question bank.`,
      });
    }

    if (!mcqParsed.questions.length) {
      return NextResponse.json(
        {
          error:
            'No MCQs could be extracted. Use CSV columns question_text, option_a, option_b, option_c, option_d, correct_answer — or numbered PDF questions with A–D options.',
          warnings: mcqParsed.warnings,
          textPreview: extractedText.slice(0, 500),
          charsExtracted: extractedText.length,
          formatHint: MCQ_UPLOAD_FORMAT_HINT,
        },
        { status: 422 },
      );
    }

    const inserted = await insertMcqsForTopic(mcqParsed.questions, topicSlug, topicName);
    return NextResponse.json({
      ok: true,
      kind: 'mcq',
      inserted,
      topicSlug,
      warnings: mcqParsed.warnings,
      message: `Saved ${inserted} MCQ(s) under “${topicName || topicSlug}”.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save questions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
