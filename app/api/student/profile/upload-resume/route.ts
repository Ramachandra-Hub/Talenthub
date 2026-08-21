/**
 * Resume file upload — stores in AWS S3 and records path on the user row (production RDS stack).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isS3Configured, putObjectBuffer } from '@/lib/aws/s3';
import { extractTextFromUpload } from '@/lib/question-bank/parse-upload-content';
import { rateLimitInMemory, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['pdf', 'docx', 'txt']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream',
]);

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = rateLimitInMemory(`resume-upload:${userId}:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many uploads. Try again shortly.' }, { status: 429 });
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      {
        error:
          'Resume file upload requires AWS S3. Paste your resume text on the profile page instead.',
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Resume file must be 5 MB or smaller.' }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = (safeName.split('.').pop()?.toLowerCase() ?? '').replace(/^\.+/, '');
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: 'Only PDF, DOCX, or TXT resume files are allowed.' },
      { status: 400 },
    );
  }
  const contentType = (file.type || '').toLowerCase();
  if (contentType && !ALLOWED_MIME.has(contentType)) {
    return NextResponse.json(
      { error: 'Unsupported resume content type.' },
      { status: 400 },
    );
  }

  const forcedMime =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain';

  const storagePath = `resumes/${userId}/resume-${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let resumeText: string | undefined;
  try {
    const extracted = await extractTextFromUpload(buffer, safeName, forcedMime);
    resumeText = extracted.text?.trim().slice(0, 100_000) || undefined;
  } catch {
    /* keep upload even if parse fails */
  }

  try {
    await putObjectBuffer({
      key: storagePath,
      body: buffer,
      contentType: forcedMime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      resumeFileName: file.name,
      resumeStoragePath: storagePath,
      resumeUpdatedAt: new Date(),
      ...(resumeText ? { resumeText } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    storagePath,
    fileName: file.name,
    textExtracted: Boolean(resumeText),
  });
}
