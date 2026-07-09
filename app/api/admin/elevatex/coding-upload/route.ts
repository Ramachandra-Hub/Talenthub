import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  parseCodingProblemsCsv,
  parseCodingProblemsJson,
  CODING_UPLOAD_FORMAT_HINT,
} from '@/lib/exam-builder/parse-coding-upload';
import { saveElevateXExamConfig } from '@/lib/elevatex-admin';
import { mergeElevateXExamConfig, parseElevateXExamConfig } from '@/lib/placement/elevatex-exam-config';

export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024;

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
  const requestId = String(form.get('requestId') ?? '').trim();
  const defaultLanguage = String(form.get('defaultLanguage') ?? 'c').trim() === 'python' ? 'python' : 'c';

  if (!requestId) {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a JSON or CSV file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 4 MB.' }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const text = await file.text();
  const parsed =
    name.endsWith('.csv') || file.type === 'text/csv'
      ? parseCodingProblemsCsv(text)
      : parseCodingProblemsJson(text);

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

  const { data: existing } = await admin
    .from('faculty_exam_requests')
    .select('topic')
    .eq('id', requestId)
    .maybeSingle();

  const current = mergeElevateXExamConfig(
    parseElevateXExamConfig(existing?.topic as string | null | undefined),
  );
  const mergedProblems = [...current.programmingProblems, ...parsed.problems];

  await saveElevateXExamConfig(admin, requestId, {
    programmingProblems: mergedProblems,
    programmingDefaultLanguage: defaultLanguage,
  });

  return NextResponse.json({
    message: `Added ${parsed.problems.length} problem(s). Bank now has ${mergedProblems.length}.`,
    problems: mergedProblems,
    warnings: parsed.warnings,
  });
}
