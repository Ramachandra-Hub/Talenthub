import { useAwsStack } from '@/lib/aws/stack';
import { ensureRdsSchema, isRdsSchemaReady } from '@/lib/db/ensure-rds-schema';

type RdsEnsureGlobal = {
  rdsSchemaEnsured?: boolean;
  rdsSchemaInflight?: Promise<{ ok: boolean; message: string; detail?: string; skipped?: boolean }>;
};

const g = globalThis as typeof globalThis & RdsEnsureGlobal;

/** Default on for AWS/RDS — set AUTO_RDS_SCHEMA=false to disable automatic db push. */
export function isAutoRdsSchemaEnabled(): boolean {
  if (!useAwsStack()) return false;
  return process.env.AUTO_RDS_SCHEMA !== 'false';
}

export function resetRdsSchemaCache(): void {
  g.rdsSchemaEnsured = false;
  g.rdsSchemaInflight = undefined;
}

/**
 * Ensures RDS has all tables/columns from prisma/schema.prisma.
 * Runs at most once per server instance when schema is verified ready.
 */
export async function autoEnsureRdsSchema(): Promise<{
  ok: boolean;
  message: string;
  detail?: string;
  skipped?: boolean;
}> {
  if (!isAutoRdsSchemaEnabled()) {
    return { ok: true, message: 'Auto schema disabled', skipped: true };
  }

  if (g.rdsSchemaEnsured && (await isRdsSchemaReady())) {
    return { ok: true, message: 'Schema already ensured this instance' };
  }

  if (g.rdsSchemaEnsured && !(await isRdsSchemaReady())) {
    resetRdsSchemaCache();
  }

  if (!g.rdsSchemaInflight) {
    g.rdsSchemaInflight = (async () => {
      if (await isRdsSchemaReady()) {
        return { ok: true, message: 'Schema already present' };
      }
      const result = await ensureRdsSchema();
      if (!result.ok) {
        return result;
      }
      if (!(await isRdsSchemaReady())) {
        return {
          ok: false,
          message: 'Schema sync incomplete',
          detail:
            'prisma db push finished but the users table is still missing. Run pnpm init:rds from your PC or POST /api/setup/rds.',
        };
      }
      return result;
    })().then((result) => {
      if (result.ok) {
        g.rdsSchemaEnsured = true;
      } else {
        resetRdsSchemaCache();
      }
      g.rdsSchemaInflight = undefined;
      return result;
    });
  }

  return g.rdsSchemaInflight;
}
