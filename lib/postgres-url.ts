/** True when value is a Prisma-compatible Postgres URL. */
export function isValidPostgresConnectionUrl(url: string): boolean {
  const t = url.trim();
  if (!/^postgres(ql)?:\/\//i.test(t)) return false;
  if (/^\s*(export|psql|host=)/i.test(t)) return false;
  try {
    const u = new URL(t.replace(/^postgresql:/i, 'http:'));
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** Detect common copy-paste mistakes (psql CLI, shell export, hostname only). */
export function getDatabaseSetupErrors(): string[] {
  const errors: string[] = [];
  const raw = process.env.DATABASE_URL?.trim();

  if (!raw) {
    errors.push(
      'DATABASE_URL is not set. Copy .env.local.example to .env.local and paste your RDS URL.',
    );
    return errors;
  }

  if (
    raw.includes('REPLACE_WITH') ||
    raw.includes('PASSWORD@') ||
    raw.includes('YOUR_RDS_PASSWORD') ||
    raw.includes('YOUR_PASSWORD')
  ) {
    errors.push('DATABASE_URL is still a placeholder — replace YOUR_RDS_PASSWORD with your RDS master password.');
    return errors;
  }

  if (isValidPostgresConnectionUrl(raw)) return errors;

  if (/psql\s/i.test(raw) || /^\s*export\s/i.test(raw) || /host=\$/i.test(raw)) {
    errors.push(
      'DATABASE_URL must be a postgresql:// connection string, not a psql or shell command. ' +
        'Example: postgresql://prepindia_admin:YOUR_PASSWORD@prepindia-db.xxxx.ap-south-1.rds.amazonaws.com:5432/postgres?sslmode=require',
    );
    return errors;
  }

  if (!raw.includes('://') && raw.includes('rds.amazonaws.com')) {
    errors.push(
      'DATABASE_URL looks like a hostname only. Use a full postgresql://user:password@host:5432/dbname?sslmode=require URL.',
    );
    return errors;
  }

  errors.push(
    'DATABASE_URL is not a valid PostgreSQL URL. It must start with postgresql:// (see .env.local.example).',
  );
  return errors;
}

/** Build URL from RDS_HOST + DATABASE_PASSWORD when DATABASE_URL was pasted incorrectly. */
function tryRepairDatabaseUrl(raw: string): string | null {
  if (isValidPostgresConnectionUrl(raw)) return raw;

  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password || password.includes('YOUR_')) return null;

  const hostFromEnv = process.env.RDS_HOST?.trim();
  const hostMatch =
    hostFromEnv?.match(/[\w.-]+\.rds\.amazonaws\.com/i) ??
    raw.match(/([\w.-]+\.rds\.amazonaws\.com)/i);
  const host = hostMatch
    ? typeof hostMatch === 'string'
      ? hostMatch
      : hostMatch[1]
    : null;
  if (!host) return null;

  const userMatch = raw.match(/user[=:\s]+([\w-]+)/i);
  const dbMatch = raw.match(/dbname[=:\s]+([\w-]+)/i);
  const user = process.env.RDS_USER?.trim() || userMatch?.[1] || 'prepindia_admin';
  const database = process.env.RDS_NAME?.trim() || dbMatch?.[1] || 'postgres';
  const port = process.env.RDS_PORT?.trim() || '5432';

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
}

/** AWS RDS rejects non-SSL clients (pg_hba "no encryption"). */
export function withAwsRdsSsl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const isRds =
    trimmed.includes('rds.amazonaws.com') ||
    trimmed.includes('.amazonaws.com') ||
    process.env.USE_AWS_STACK === 'true';
  if (!isRds) return trimmed;
  if (/[?&]sslmode=/i.test(trimmed)) return trimmed;
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}sslmode=require`;
}

/** Patch env before Prisma/postgres clients connect (safe to call repeatedly). */
export function normalizeDatabaseEnvUrls(): void {
  const primary = process.env.DATABASE_URL?.trim();
  if (primary) {
    const repaired = tryRepairDatabaseUrl(primary);
    if (repaired && repaired !== primary) {
      process.env.DATABASE_URL = withAwsRdsSsl(repaired);
      if (!process.env.DIRECT_URL?.trim() || !isValidPostgresConnectionUrl(process.env.DIRECT_URL)) {
        process.env.DIRECT_URL = process.env.DATABASE_URL;
      }
    }
  }

  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL'] as const) {
    const raw = process.env[key]?.trim();
    if (!raw || raw.includes('YOUR_') || raw.includes('REPLACE_WITH')) continue;
    if (!isValidPostgresConnectionUrl(raw)) continue;
    process.env[key] = withAwsRdsSsl(raw);
  }
}

/** Resolve Postgres connection string from env (DATABASE_URL or POSTGRES_URL). */
export function resolvePostgresUrl(): string | null {
  normalizeDatabaseEnvUrls();

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && !databaseUrl.includes('YOUR_')) return databaseUrl;

  const direct = process.env.POSTGRES_URL?.trim();
  if (direct && !direct.includes('YOUR_')) return direct;

  const password = process.env.DATABASE_PASSWORD?.trim();
  const host = process.env.RDS_HOST?.trim();
  const port = process.env.RDS_PORT?.trim() || '5432';
  const user = process.env.RDS_USER?.trim() || 'postgres';
  const database = process.env.RDS_NAME?.trim() || 'prepindia';

  if (!password || !host || host.includes('YOUR_')) return null;

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
}

export function postgresUrlSetupHint(): string {
  return (
    'Set DATABASE_URL in .env.local (AWS RDS PostgreSQL connection string), ' +
    'or set POSTGRES_URL / RDS_HOST + DATABASE_PASSWORD.'
  );
}

/** AWS RDS console SQL workspace (region-specific). */
export function rdsSqlEditorUrl(): string | null {
  const region = process.env.AWS_REGION?.trim() || 'ap-south-1';
  return `https://${region}.console.aws.amazon.com/rds/home?#databases:`;
}
