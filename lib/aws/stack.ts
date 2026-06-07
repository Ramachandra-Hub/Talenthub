/** AWS stack — RDS + Prisma + NextAuth JWT (+ optional S3). */
export function useAwsStack(): boolean {
  if (process.env.USE_AWS_STACK === 'false' || process.env.USE_AWS_STACK === '0') {
    return false;
  }
  if (process.env.USE_AWS_STACK === 'true' || process.env.NEXT_PUBLIC_USE_AWS_STACK === 'true') {
    return true;
  }
  return process.env.USE_PRISMA_AUTH === 'true' || Boolean(process.env.DATABASE_URL?.trim());
}
