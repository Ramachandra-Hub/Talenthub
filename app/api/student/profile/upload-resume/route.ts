/**
 * Resume file upload — stores in AWS S3 and records path on the user row (production RDS stack).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isS3Configured, putObjectBuffer } from '@/lib/aws/s3';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
  const ext = safeName.split('.').pop()?.toLowerCase() ?? 'dat';
  const storagePath = `resumes/${userId}/resume-${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  try {
    await putObjectBuffer({
      key: storagePath,
      body: Buffer.from(arrayBuffer),
      contentType: file.type || 'application/octet-stream',
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
    },
  });

  return NextResponse.json({
    ok: true,
    storagePath,
    fileName: file.name,
  });
}
