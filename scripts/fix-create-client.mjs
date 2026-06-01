import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'app/api/admin/init-db/route.ts',
  'app/api/setup/initialize/route.ts',
  'app/api/setup/seed/route.ts',
  'app/api/setup/seed-elevatex-sample/route.ts',
  'app/api/setup/reset-elevatex-attempts/route.ts',
  'app/api/setup/reset-elevatex-sample/route.ts',
  'app/api/setup/seed-demo-users/route.ts',
];

for (const rel of files) {
  const file = path.join(root, rel);
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(
    /import \{ createClient \} from '@\/lib\/db\/get-db-service';/g,
    "import { getDbService } from '@/lib/db/get-db-service';",
  );
  text = text.replace(
    /const rdsUrl = process\.env\.NEXT_PUBLIC_APP_URL \|\| '';\s*\nconst serviceRoleKey = process\.env\.AUTH_SECRET \|\| '';\s*\nconst isDatabaseConfigured =\s*\n\s*!!rdsUrl &&\s*\n\s*!!serviceRoleKey &&\s*\n\s*rdsUrl\.includes\('\.db\.co'\) &&\s*\n\s*!rdsUrl\.includes\('YOUR_'\) &&\s*\n\s*!serviceRoleKey\.includes\('YOUR_'\);/g,
    `const isDatabaseConfigured =
  !!process.env.DATABASE_URL?.trim() &&
  !!process.env.AUTH_SECRET?.trim() &&
  !process.env.DATABASE_URL.includes('YOUR_') &&
  !process.env.AUTH_SECRET.includes('YOUR_');`,
  );
  text = text.replace(
    /\{ error: 'Set NEXT_PUBLIC_APP_URL and AUTH_SECRET in \.env\.local' \}/g,
    "{ error: 'Set DATABASE_URL and AUTH_SECRET in .env.local' }",
  );
  text = text.replace(
    /const db = createClient\(rdsUrl, serviceRoleKey, \{[\s\S]*?\}\);/g,
    'const db = getDbService();',
  );
  // seed-demo-users variant
  text = text.replace(
    /const rdsUrl = process\.env\.NEXT_PUBLIC_APP_URL\?\.trim\(\);\s*\n\s*const serviceRoleKey = getServiceRoleKey\(\);\s*\n\s*if \(!rdsUrl \|\| !serviceRoleKey \|\| !rdsUrl\.includes\('\.db\.co'\)\) \{[\s\S]*?\}\s*\n\s*const db = createClient\(rdsUrl, serviceRoleKey, \{[\s\S]*?\}\);/,
    `if (!process.env.DATABASE_URL?.trim() || !getServiceRoleKey()) {
    return NextResponse.json(
      {
        error: 'Set DATABASE_URL and AUTH_SECRET in .env.local',
      },
      { status: 500 },
    );
  }

  const db = getDbService();`,
  );
  text = text.replace(
    /import type \{ DbServiceClient \} from '@\/lib\/db\/get-db-service';/,
    "import { getDbService, type DbServiceClient } from '@/lib/db/get-db-service';",
  );
  fs.writeFileSync(file, text);
  console.log('Fixed', rel);
}
