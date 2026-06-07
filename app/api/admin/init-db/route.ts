import { NextRequest, NextResponse } from 'next/server';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

/** Legacy Supabase schema bootstrap — disabled on production AWS RDS stack. */
export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  return NextResponse.json(
    {
      error:
        'init-db is retired on the AWS RDS stack. Use POST /api/setup/rds (admin login or RDS_SETUP_SECRET) and `pnpm exec prisma migrate deploy`.',
    },
    { status: 410 },
  );
}
