import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  parseCodingProblemsPlainText,
  parseCodingUploadText,
  CODING_UPLOAD_FORMAT_HINT,
} from '@/lib/exam-builder/parse-coding-upload';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import { saveElevateXExamConfig } from '@/lib/elevatex-admin';
import type { ElevateXProgrammingLanguage } from '@/lib/placement/elevatex-exam-config';
import {
  insertCodingProblemsIntoBank,
  loadCodingBankFromDb,
  ensureCodingBankTags,
} from '@/lib/coding/coding-bank-store';

export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024;

/** Legacy route — saves to global coding bank; optionally syncs ElevateX config when requestId is set. */
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
  const pasteText = String(form.get('pasteText') ?? '').trim();
  const requestId = String(form.get('requestId') ?? '').trim();
  const defaultLanguageRaw = String(form.get('defaultLanguage') ?? 'c').trim();
  const defaultLanguage =
    defaultLanguageRaw === 'python' || defaultLanguageRaw === 'java' ? defaultLanguageRaw : 'c';

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

  await ensureCodingBankTags();
  await insertCodingProblemsIntoBank(parsed.problems, defaultLanguage);
  const bankProblems = await loadCodingBankFromDb({ language: 'all' });

  if (requestId) {
    const programmingDefaultLanguage: ElevateXProgrammingLanguage =
      defaultLanguage === 'python' ? 'python' : 'c';

    await saveElevateXExamConfig(admin, requestId, {
      programmingProblems: bankProblems,
      programmingDefaultLanguage,
    });
  }

  return NextResponse.json({
    message: `Added ${parsed.problems.length} problem(s). Bank now has ${bankProblems.length}.`,
    problems: bankProblems,
    warnings: parsed.warnings,
  });
}
