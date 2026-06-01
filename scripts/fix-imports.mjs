import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, files);
    } else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

const RDS_FIX = /on RDS(\s*$|\s*\n)/g;
const RDS_REPL = "on RDS.'$1";

let count = 0;
for (const file of walk(path.join(root, 'app')).concat(walk(path.join(root, 'lib')))) {
  let text = fs.readFileSync(file, 'utf8');
  let next = text.replace(
    /import \{ requireAuth, getDbService \} from '@\/lib\/server-auth'/g,
    "import { requireAuth } from '@/lib/server-auth'",
  );
  if (next.includes("requireAuth } from '@/lib/server-auth'") && !next.includes("from '@/lib/db/get-db-service'")) {
    next = next.replace(
      /^(import .+\n)(?!import \{ getDbService)/m,
      "$1import { getDbService } from '@/lib/db/get-db-service';\n",
    );
  }
  next = next.replace(RDS_FIX, RDS_REPL);
  if (next !== text) {
    fs.writeFileSync(file, next);
    count++;
  }
}
console.log('Updated', count, 'files');
