/**
 * Prisma generate and Next build need DATABASE_URL / DIRECT_URL / AUTH_SECRET in env.
 * Vercel builds fail at `pnpm install` (postinstall) when these are missing.
 * Real values from Vercel Dashboard override vercel.json placeholders at runtime.
 */
const BUILD_PLACEHOLDER_DB =
  'postgresql://prisma_build:prisma_build@127.0.0.1:5432/prisma_build?sslmode=disable';
const BUILD_PLACEHOLDER_AUTH =
  'vercel-build-placeholder-auth-secret-must-replace-in-dashboard';

function isPlaceholder(value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  return (
    v.includes('YOUR_') ||
    v.includes('REPLACE_WITH') ||
    v.includes('prisma_build@127.0.0.1')
  );
}

export function ensurePrismaEnv() {
  if (isPlaceholder(process.env.DATABASE_URL)) {
    process.env.DATABASE_URL = BUILD_PLACEHOLDER_DB;
  }
  if (isPlaceholder(process.env.DIRECT_URL)) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
  if (!process.env.AUTH_SECRET?.trim() || process.env.AUTH_SECRET.length < 16) {
    process.env.AUTH_SECRET = BUILD_PLACEHOLDER_AUTH;
  }
}
