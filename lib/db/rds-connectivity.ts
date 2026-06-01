import { isValidPostgresConnectionUrl } from '@/lib/postgres-url';

export type ParsedDbUrl = {
  host: string;
  port: string;
  database: string;
  user: string;
};

/** Parse postgresql:// URL for diagnostics (password not returned). */
export function parsePostgresUrl(url: string): ParsedDbUrl | null {
  if (!isValidPostgresConnectionUrl(url)) return null;
  try {
    const u = new URL(url.trim().replace(/^postgresql:/i, 'http:'));
    return {
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '') || 'postgres',
      user: decodeURIComponent(u.username || 'postgres'),
    };
  } catch {
    return null;
  }
}

export function isRdsUnreachableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("can't reach database server") ||
    m.includes('connection refused') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('timeout') ||
    m.includes('enotfound') ||
    m.includes('network is unreachable')
  );
}

export function isRdsAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('authentication failed') ||
    m.includes('password authentication failed') ||
    m.includes('invalid credentials')
  );
}

export function getDatabaseUrlMismatchWarnings(): string[] {
  const db = process.env.DATABASE_URL?.trim();
  const direct = process.env.DIRECT_URL?.trim();
  if (!db || !direct || !isValidPostgresConnectionUrl(db) || !isValidPostgresConnectionUrl(direct)) {
    return [];
  }

  const warnings: string[] = [];
  const a = parsePostgresUrl(db);
  const b = parsePostgresUrl(direct);
  if (!a || !b) return warnings;

  if (a.host !== b.host) {
    warnings.push(`DIRECT_URL host (${b.host}) differs from DATABASE_URL host (${a.host}).`);
  }
  if (a.user !== b.user) {
    warnings.push('DIRECT_URL username differs from DATABASE_URL.');
  }

  try {
    const u1 = new URL(db.replace(/^postgresql:/i, 'http:'));
    const u2 = new URL(direct.replace(/^postgresql:/i, 'http:'));
    if (u1.password !== u2.password) {
      warnings.push(
        'DIRECT_URL password differs from DATABASE_URL — set both to the same RDS connection string.',
      );
    }
  } catch {
    /* ignore */
  }

  return warnings;
}

/** Steps when Vercel/serverless cannot open TCP 5432 to RDS. */
export function getRdsUnreachableRemediation(host?: string): string[] {
  const endpoint = host ?? 'your-db.xxxxx.ap-south-1.rds.amazonaws.com';
  const onVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

  const steps = [
    'AWS Console → RDS → Databases → select your instance → Modify.',
    'Set **Public access** to **Yes** → Continue → Apply immediately (wait until Available).',
    'RDS → Connectivity & security → VPC security group → **Inbound rules** → Add: Type **PostgreSQL**, Port **5432**, Source **0.0.0.0/0** (trial only).',
    `Confirm the **Endpoint** in AWS matches DATABASE_URL host: \`${endpoint}\`.`,
    'DATABASE_URL must include `?sslmode=require` (and on Vercel add `&connection_limit=1`).',
  ];

  if (onVercel) {
    steps.push(
      'Update **both** DATABASE_URL and DIRECT_URL in Vercel → Settings → Environment Variables (Production), then **Redeploy**.',
    );
    steps.push(
      'After AWS changes, run `pnpm verify:rds` on your PC; when that passes, Vercel can connect too.',
    );
  } else {
    steps.push('Run `pnpm verify:rds` from your PC to test TCP + login before redeploying Vercel.');
  }

  return steps;
}

export function classifyDatabaseError(message: string): {
  code: 'unreachable' | 'auth' | 'schema' | 'unknown';
  remediation: string[];
} {
  const parsed = parsePostgresUrl(process.env.DATABASE_URL ?? '');
  const host = parsed?.host;

  if (isRdsUnreachableError(message)) {
    return { code: 'unreachable', remediation: getRdsUnreachableRemediation(host) };
  }
  if (isRdsAuthError(message)) {
    return {
      code: 'auth',
      remediation: [
        'Reset the RDS master password in AWS Console if needed.',
        'Update DATABASE_URL and DIRECT_URL with the same password (URL-encode special characters).',
        'Redeploy Vercel after saving environment variables.',
      ],
    };
  }
  if (/does not exist|relation/i.test(message)) {
    return {
      code: 'schema',
      remediation: [
        'Database is reachable but tables are missing.',
        'Open /api/setup/rds once after connectivity is fixed, or run `pnpm init:rds` from your PC.',
      ],
    };
  }
  return { code: 'unknown', remediation: [message] };
}
