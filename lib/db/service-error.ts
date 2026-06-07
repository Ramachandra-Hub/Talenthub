/** Read message from Prisma service client / PostgREST-style errors. */
export function readServiceError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const msg = (error as { message?: unknown }).message;
  return typeof msg === 'string' ? msg : undefined;
}
