/**
 * Assign a roll number to the DSA practice roster.
 * Usage: node scripts/assign-dsa-roster.mjs 12ME1A0275
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  for (const name of ['.env.production', '.env.local', '.env']) {
    const envPath = path.join(__dirname, '..', name);
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
}

loadEnvLocal();

const rollRaw = process.argv[2] || '12ME1A0275';
const rollNumber = rollRaw.trim().toUpperCase().replace(/\s+/g, '');

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "dsa_roster" (
      "id" UUID NOT NULL,
      "roll_number" TEXT NOT NULL,
      "full_name" TEXT,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "note" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "dsa_roster_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "dsa_roster_roll_number_key" ON "dsa_roster"("roll_number")`,
  );

  const row = await prisma.dsaRosterEntry.upsert({
    where: { rollNumber },
    update: { isActive: true, note: 'manual test assignment' },
    create: {
      rollNumber,
      isActive: true,
      note: 'manual test assignment',
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        rollNumber: row.rollNumber,
        isActive: row.isActive,
        id: row.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
