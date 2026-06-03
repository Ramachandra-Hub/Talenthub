import { ensureRdsSchemaReadyForWrites, isRdsSchemaReady } from '@/lib/db/ensure-rds-schema';

/**
 * Prepare DB for login. On Vercel/serverless we never run `prisma db push` during sign-in
 * (it fails or times out); use /api/setup/rds or init:rds instead.
 */
export async function ensureSchemaForAuth(): Promise<void> {
  if (await isRdsSchemaReady()) return;

  const onVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  if (onVercel) {
    throw new Error(
      'Database tables are not ready. Open https://your-app.vercel.app/setup (or POST /api/setup/rds) once, then try login again.',
    );
  }

  await ensureRdsSchemaReadyForWrites();
}
