import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { z } from 'zod';
import { createProctorUploadUrl, isS3Configured, proctorScreenshotKey } from '@/lib/aws/s3';
import { requireAuth } from '@/lib/server-auth';
import { rateLimitInMemory, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  attemptId: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/webp', 'image/png']),
  fileName: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  if (!isS3Configured()) {
    return NextResponse.json({ error: 'S3 storage is not configured' }, { status: 500 });
  }

  const rl = rateLimitInMemory(`proctor-upload:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await requireAuth(['student', 'admin'], request);
  if ('response' in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  const ext =
    parsed.data.contentType === 'image/webp'
      ? 'webp'
      : parsed.data.contentType === 'image/png'
        ? 'png'
        : 'jpg';

  const key = proctorScreenshotKey(
    parsed.data.attemptId,
    parsed.data.fileName ?? `capture.${ext}`,
  );

  const signed = await createProctorUploadUrl({
    key,
    contentType: parsed.data.contentType,
    expiresInSeconds: 300,
  });

  return NextResponse.json({
    uploadUrl: signed.uploadUrl,
    key: signed.key,
    bucket: signed.bucket,
    method: 'PUT',
  });
}
