const DB_ENV_KEYS = ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL'] as const;

/** Strip quotes, newlines, and BOM from Vercel / .env paste mistakes. */
export function sanitizeDatabaseEnvValue(raw: string): string {
  let t = raw.replace(/^\uFEFF/, '').trim();
  while (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('`') && t.endsWith('`'))
  ) {
    t = t.slice(1, -1).trim();
  }
  const line = t.split(/\r?\n/).find((l) => l.trim().length > 0);
  return (line ?? t).trim();
}

/** True when value is a Prisma-compatible Postgres URL. */
export function isValidPostgresConnectionUrl(url: string): boolean {
  const t = sanitizeDatabaseEnvValue(url);
  if (!/^postgres(ql)?:\/\//i.test(t)) return false;
  if (/^\s*(export|psql|host=)/i.test(t)) return false;

  const withoutQuery = t.split('?')[0] ?? t;
  const authority = withoutQuery.replace(/^postgres(ql)?:\/\//i, '');
  const at = authority.lastIndexOf('@');
  if (at <= 0) return false;

  const hostPart = authority.slice(at + 1);
  if (!hostPart.includes('.') && !hostPart.startsWith('localhost')) return false;

  try {
    const u = new URL(t.replace(/^postgres(ql)?:\/\//i, 'http://'));
    return Boolean(u.hostname);
  } catch {
    return /^postgres(ql)?:\/\/[^@\s]+@[^/\s?#]+(:\d+)?\/[^?\s#]+/i.test(t);
  }
}

function describeInvalidDatabaseUrl(raw: string): string {
  if (/^["'`]/.test(raw.trim()) || /["'`]$/.test(raw.trim())) {
    return 'Remove surrounding quotes from DATABASE_URL in Vercel — paste only postgresql://... with no " or \' characters.';
  }
  if (raw.includes('\n') || raw.includes('\r')) {
    return 'DATABASE_URL must be a single line (no line breaks). Paste one full postgresql:// URL.';
  }
  if (/psql\s/i.test(raw) || /^\s*export\s/i.test(raw) || /host=\$/i.test(raw)) {
    return 'DATABASE_URL must be postgresql://..., not a psql or shell export command.';
  }
  if (!raw.includes('://') && raw.includes('rds.amazonaws.com')) {
    return 'DATABASE_URL looks like a hostname only. Use postgresql://user:password@host:5432/dbname?sslmode=require';
  }
  if (raw.includes('://') && !/^postgres(ql)?:\/\//i.test(sanitizeDatabaseEnvValue(raw))) {
    return 'DATABASE_URL must use the postgresql:// scheme (not mysql:// or https://).';
  }
  return 'DATABASE_URL must start with postgresql:// (see .env.local.example). On Vercel, do not wrap the value in quotes.';
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
}

function envSetupHint(): string {
  if (isVercelRuntime()) {
    return 'Vercel → Project → Settings → Environment Variables → Production: set DATABASE_URL, DIRECT_URL, AUTH_SECRET, AUTH_URL, then Redeploy.';
  }
  return 'Copy .env.local.example to .env.local and paste your AWS RDS DATABASE_URL and AUTH_SECRET, then restart npm run dev.';
}

/** Detect common copy-paste mistakes (psql CLI, shell export, hostname only). */
export function getDatabaseSetupErrors(): string[] {
  normalizeDatabaseEnvUrls();

  const errors: string[] = [];
  const raw = process.env.DATABASE_URL?.trim() ?? '';
  const hint = envSetupHint();

  if (!raw) {
    errors.push(`DATABASE_URL is not set. ${hint}`);
    return errors;
  }

  if (
    raw.includes('REPLACE_WITH') ||
    raw.includes('PASSWORD@') ||
    raw.includes('YOUR_RDS_PASSWORD') ||
    raw.includes('YOUR_PASSWORD') ||
    raw.includes('prisma_build@127.0.0.1') ||
    raw.includes('generate-with-openssl')
  ) {
    errors.push(`DATABASE_URL is still a placeholder. ${hint}`);
    return errors;
  }

  const authSecret = process.env.AUTH_SECRET?.trim() ?? '';
  if (
    !authSecret ||
    authSecret.includes('vercel-build-placeholder') ||
    authSecret === 'build-time-placeholder-replace-in-vercel-dashboard-min-32-chars-long' ||
    authSecret.includes('generate-with-openssl')
  ) {
    errors.push(
      `AUTH_SECRET is missing or still a placeholder (use: openssl rand -base64 32). ${hint}`,
    );
  }

  if (isValidPostgresConnectionUrl(raw)) return errors;

  errors.push(describeInvalidDatabaseUrl(raw));
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

function appendQueryParam(url: string, param: string): string {
  if (new RegExp(`[?&]${param.split('=')[0]}=`, 'i').test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${param}`;
}

/**
 * Prisma-only URL params (postgres.js / libpq send unknown ?key= values to the server and fail).
 * Keep DATABASE_URL with connection_limit for Prisma; use this for the postgres() driver.
 */
export function stripDriverUnsafeUrlParams(url: string): string {
  return url
    .replace(/([?&])connection_limit=\d+/gi, '$1')
    .replace(/([?&])connect_timeout=\d+/gi, '$1')
    .replace(/([?&])pool_timeout=\d+/gi, '$1')
    .replace(/([?&])socket_timeout=\d+/gi, '$1')
    .replace(/([?&])pgbouncer=[^&]*/gi, '$1')
    .replace(/([?&])schema=[^&]*/gi, '$1')
    .replace(/\?&/g, '?')
    .replace(/[?&]$/g, '')
    .replace(/\?$/, '');
}

/** DIRECT_URL / migrations: drop Prisma pool cap (not needed for db push). */
export function withoutPoolLimit(url: string): string {
  return url
    .replace(/([?&])connection_limit=\d+/gi, '$1')
    .replace(/\?&/g, '?')
    .replace(/[?&]$/g, '')
    .replace(/\?$/, '');
}

/** Serverless-friendly query params for Vercel + RDS (Prisma reads connection_limit from URL). */
export function withServerlessDbParams(url: string): string {
  let out = withAwsRdsSsl(url);
  const onVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  if (onVercel) {
    // 3 connections per lambda — enough for one submit without exhausting RDS.
    out = appendQueryParam(out, 'connection_limit=3');
    out = appendQueryParam(out, 'connect_timeout=15');
    out = appendQueryParam(out, 'pool_timeout=15');
  }
  return out;
}

function normalizeDbEnvValue(key: (typeof DB_ENV_KEYS)[number], url: string): string {
  const base = withServerlessDbParams(url);
  return key === 'DATABASE_URL' ? withLocalDevDbParams(base) : base;
}

/** Local dev needs more than one Prisma connection when the admin dashboard polls live data. */
export function withLocalDevDbParams(url: string): string {
  const onVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  if (onVercel || process.env.NODE_ENV === 'production') return url;
  let out = url.replace(/([?&])connection_limit=\d+/gi, '$1');
  out = out.replace(/\?&/g, '?').replace(/[?&]$/g, '');
  return appendQueryParam(out, 'connection_limit=5');
}

/** Patch env before Prisma/postgres clients connect (safe to call repeatedly). */
export function normalizeDatabaseEnvUrls(): void {
  for (const key of DB_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    const cleaned = sanitizeDatabaseEnvValue(raw);
    if (cleaned !== raw) process.env[key] = cleaned;
  }

  if (!process.env.DATABASE_URL?.trim() && process.env.POSTGRES_URL?.trim()) {
    process.env.DATABASE_URL = process.env.POSTGRES_URL;
  }

  const primary = process.env.DATABASE_URL?.trim();
  if (primary) {
    const repaired = tryRepairDatabaseUrl(primary);
    if (repaired && repaired !== primary) {
      process.env.DATABASE_URL = withLocalDevDbParams(withServerlessDbParams(repaired));
      if (!process.env.DIRECT_URL?.trim() || !isValidPostgresConnectionUrl(process.env.DIRECT_URL)) {
        process.env.DIRECT_URL = withServerlessDbParams(repaired);
      }
    }
  }

  for (const key of DB_ENV_KEYS) {
    const raw = process.env[key]?.trim();
    if (!raw || raw.includes('YOUR_') || raw.includes('REPLACE_WITH')) continue;
    if (!isValidPostgresConnectionUrl(raw)) continue;
    process.env[key] = normalizeDbEnvValue(key, raw);
  }

  const db = process.env.DATABASE_URL?.trim();
  const direct = process.env.DIRECT_URL?.trim();
  if (db && isValidPostgresConnectionUrl(db)) {
    const normalizedDb = withLocalDevDbParams(withServerlessDbParams(db));
    process.env.DATABASE_URL = normalizedDb;

    if (!direct || !isValidPostgresConnectionUrl(direct)) {
      process.env.DIRECT_URL = withServerlessDbParams(withoutPoolLimit(db));
      return;
    }

    try {
      const dbHost = new URL(db.replace(/^postgresql:/i, 'http:')).hostname;
      const directHost = new URL(direct.replace(/^postgresql:/i, 'http:')).hostname;
      const dbPass = new URL(db.replace(/^postgresql:/i, 'http:')).password;
      const directPass = new URL(direct.replace(/^postgresql:/i, 'http:')).password;
      if (dbHost !== directHost || dbPass !== directPass) {
        process.env.DIRECT_URL = normalizedDb;
      } else {
        process.env.DIRECT_URL = withServerlessDbParams(direct);
      }
    } catch {
      process.env.DIRECT_URL = normalizedDb;
    }
  }

  if (!isValidPostgresConnectionUrl(process.env.DATABASE_URL ?? '')) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    const host = process.env.RDS_HOST?.trim();
    if (password && host && !password.includes('YOUR_')) {
      const user = process.env.RDS_USER?.trim() || 'prepindia_admin';
      const port = process.env.RDS_PORT?.trim() || '5432';
      const database = process.env.RDS_NAME?.trim() || 'postgres';
      const built = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
      if (isValidPostgresConnectionUrl(built)) {
        process.env.DATABASE_URL = withLocalDevDbParams(withServerlessDbParams(built));
        if (!isValidPostgresConnectionUrl(process.env.DIRECT_URL ?? '')) {
          process.env.DIRECT_URL = withServerlessDbParams(built);
        }
      }
    }
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
