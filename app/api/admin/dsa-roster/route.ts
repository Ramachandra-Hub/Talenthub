import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import { ensureDsaTables } from '@/lib/dsa/ensure-tables';
import { normalizeDsaRoll } from '@/lib/dsa/roster';

export const runtime = 'nodejs';

/** Admin: assign / list DSA roll roster. */
export async function GET(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  await ensureDsaTables();
  const rows = await prisma.dsaRosterEntry.findMany({
    orderBy: { rollNumber: 'asc' },
  });
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      rollNumber: r.rollNumber,
      fullName: r.fullName,
      isActive: r.isActive,
      note: r.note,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  await ensureDsaTables();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const rollNumber = normalizeDsaRoll(String(body.rollNumber ?? ''));
  if (!rollNumber) {
    return NextResponse.json({ error: 'rollNumber is required' }, { status: 400 });
  }
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : null;
  const isActive = body.isActive !== false;
  const note = typeof body.note === 'string' ? body.note : null;
  const row = await prisma.dsaRosterEntry.upsert({
    where: { rollNumber },
    update: { fullName, isActive, note },
    create: { rollNumber, fullName, isActive, note },
  });
  return NextResponse.json({
    ok: true,
    entry: {
      id: row.id,
      rollNumber: row.rollNumber,
      fullName: row.fullName,
      isActive: row.isActive,
    },
  });
}
