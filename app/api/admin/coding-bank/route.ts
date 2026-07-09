import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import {
  parseCodingProblemsPlainText,
  parseCodingUploadText,
  CODING_UPLOAD_FORMAT_HINT,
} from '@/lib/exam-builder/parse-coding-upload';
import {
  insertCodingProblemsIntoBank,
  loadCodingBankFromDb,
  ensureCodingBankTags,
} from '@/lib/coding/coding-bank-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const languageParam = searchParams.get('language')?.trim() ?? 'all';
  const language =
    languageParam === 'python' ? 'python' : languageParam === 'c' ? 'c' : 'all';

  try {
    await ensureCodingBankTags();
    const problems = await loadCodingBankFromDb({ search, language });
    return NextResponse.json({ problems, total: problems.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load coding bank';
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  const defaultLanguage = String(form.get('defaultLanguage') ?? 'c').trim() === 'python' ? 'python' : 'c';

  let parsed: { problems: ProgrammingProblem[]; warnings: string[] };

  if (pasteText) {
    if (pasteText.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Paste text must be under 4 MB.' }, { status: 400 });
    }
    parsed = parseCodingProblemsPlainText(pasteText, defaultLanguage);
  } else if (file instanceof File) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File must be under 4 MB.' }, { status: 400 });
    }
    const text = await file.text();
    parsed = parseCodingUploadText(text, file.name, defaultLanguage);
  } else {
    return NextResponse.json({ error: 'Paste problem descriptions or choose a file.' }, { status: 400 });
  }

  if (!parsed.problems.length) {
    return NextResponse.json(
      {
        error: 'No valid coding problems found.',
        warnings: parsed.warnings,
        formatHint: CODING_UPLOAD_FORMAT_HINT,
      },
      { status: 422 },
    );
  }

  try {
    await ensureCodingBankTags();
    const inserted = await insertCodingProblemsIntoBank(parsed.problems, defaultLanguage);
    const problems = await loadCodingBankFromDb({ language: 'all' });

    return NextResponse.json({
      message: `Added ${inserted.length} coding problem(s) to the question bank.`,
      inserted,
      problems,
      warnings: parsed.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save coding problems';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
