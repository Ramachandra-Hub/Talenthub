import { NextResponse } from 'next/server';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const FALLBACK_CATEGORIES = [
  { id: 'fallback-quantitative', name: 'Quantitative Ability', slug: 'quantitative', description: null, icon: '📊', order: 1 },
  { id: 'fallback-verbal', name: 'Verbal Ability', slug: 'verbal', description: null, icon: '📖', order: 2 },
  { id: 'fallback-logical', name: 'Logical Reasoning', slug: 'logical', description: null, icon: '🧠', order: 3 },
  { id: 'fallback-coding', name: 'Coding / Programming', slug: 'coding', description: null, icon: '💻', order: 4 },
  { id: 'fallback-current-affairs', name: 'Current Affairs', slug: 'current-affairs', description: null, icon: '📰', order: 5 },
  { id: 'fallback-company', name: 'Company Specific', slug: 'company-specific', description: null, icon: '🏢', order: 6 },
  { id: 'fallback-psychometric', name: 'Psychometric Prep', slug: 'psychometric', description: null, icon: '🎭', order: 7 },
  { id: 'fallback-mock', name: 'Mock Interview Prep', slug: 'mock-interviews', description: null, icon: '🎤', order: 8 },
] as const;

const RDS_SETUP_HINT =
  'Run pnpm init:rds or POST /api/setup/rds on RDS. Use DATABASE_URL with ?sslmode=require (no quotes on Vercel).';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  try {
    const rows = await prisma.testCategory.findMany({
      orderBy: { order: 'asc' },
    });

    if (!rows.length) {
      return NextResponse.json({
        categories: FALLBACK_CATEGORIES,
        source: 'fallback',
        warning: `No categories in database. ${RDS_SETUP_HINT}`,
      });
    }

    return NextResponse.json({
      categories: rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon: c.icon,
        order: c.order,
      })),
      source: 'database',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    console.error('[api/admin/categories]', message);
    return NextResponse.json({
      categories: FALLBACK_CATEGORIES,
      source: 'fallback',
      warning: remediation[0] ?? message,
      error: 'Database unavailable — using built-in categories',
    });
  }
}
