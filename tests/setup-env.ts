import fs from 'fs';
import path from 'path';

/** Load .env.local before any Prisma imports in integration tests. */
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(process.cwd(), name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { normalizeDatabaseEnvUrls } = require('../lib/postgres-url') as {
    normalizeDatabaseEnvUrls: () => void;
  };
  normalizeDatabaseEnvUrls();
} catch {
  /* ignore until aliases resolve */
}
