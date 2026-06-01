import { NextRequest, NextResponse } from 'next/server';
import { useAwsStack } from '@/lib/aws/stack';
import { ensureRdsSchema, isRdsSchemaReady } from '@/lib/db/ensure-rds-schema';
import { bootstrapRdsAdmin, seedRdsBaseline } from '@/lib/db/seed-rds-baseline';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

async function isFirstRun(): Promise<boolean> {
  try {
    const count = await prisma.user.count();
    return count === 0;
  } catch {
    return true;
  }
}

async function buildRdsStatus() {
  if (!useAwsStack()) {
    return {
      status: 200,
      body: {
        mode: 'legacy',
        message: 'Set USE_AWS_STACK=true to use RDS auto-setup.',
      },
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: 503,
      body: { mode: 'aws', schemaReady: false, error: 'DATABASE_URL is not set' },
    };
  }

  const schemaReady = await isRdsSchemaReady();
  let categoryCount = 0;
  let userCount = 0;

  if (schemaReady) {
    try {
      [categoryCount, userCount] = await Promise.all([
        prisma.testCategory.count(),
        prisma.user.count(),
      ]);
    } catch {
      /* tables may be partially created */
    }
  }

  const setupComplete = schemaReady && userCount > 0 && categoryCount > 0;

  return {
    status: 200,
    body: {
      mode: 'aws',
      schemaReady,
      categoryCount,
      userCount,
      setupComplete,
      needsSchema: !schemaReady,
      needsSeed: schemaReady && categoryCount === 0,
      needsAdmin: schemaReady && userCount === 0,
      adminEmail: (process.env.PREPINDIA_ADMIN_EMAIL || 'admin@rce.ac.in').trim().toLowerCase(),
    },
  };
}

/** GET — RDS setup status (for /setup page). */
export async function GET() {
  try {
    const { status, body } = await buildRdsStatus();
    return NextResponse.json(body, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[setup/rds] GET failed:', message);
    return NextResponse.json(
      { mode: 'aws', schemaReady: false, error: message },
      { status: 500 },
    );
  }
}

/** POST — create/update schema, seed sample data, bootstrap admin. */
export async function POST(request: NextRequest) {
  try {
    if (!useAwsStack()) {
      return NextResponse.json(
        { error: 'RDS setup only runs when USE_AWS_STACK=true' },
        { status: 400 },
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 503 });
    }

    let body: { step?: 'schema' | 'seed' | 'admin' | 'all'; setupSecret?: string } = {
      step: 'all',
    };
    try {
      const text = await request.text();
      if (text.trim()) {
        body = { step: 'all', ...(JSON.parse(text) as typeof body) };
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const step = body.step ?? 'all';
    const { body: statusPreview } = await buildRdsStatus();
    const preview = statusPreview as {
      setupComplete?: boolean;
      needsSchema?: boolean;
      needsSeed?: boolean;
      adminEmail?: string;
    };

    const secret = process.env.RDS_SETUP_SECRET?.trim();
    if (secret) {
      const provided = request.headers.get('x-rds-setup-secret') ?? body.setupSecret;
      if (provided !== secret) {
        return NextResponse.json({ error: 'Invalid RDS_SETUP_SECRET' }, { status: 403 });
      }
    } else if (preview.setupComplete && step === 'all') {
      return NextResponse.json({
        ok: true,
        alreadyConfigured: true,
        message:
          'Database is already set up. Sign in at /auth/login/admin — no need to run setup again.',
        adminEmail: preview.adminEmail,
        status: statusPreview,
      });
    } else if (!(await isFirstRun()) && step === 'all' && !preview.needsSchema && !preview.needsSeed) {
      return NextResponse.json(
        {
          error: 'Database already has users.',
          alreadyConfigured: true,
          hint:
            'Use /auth/login/admin to sign in. To force a full re-setup, set RDS_SETUP_SECRET in Vercel env and pass it in the request.',
          adminEmail: preview.adminEmail,
          status: statusPreview,
        },
        { status: 403 },
      );
    }
    const results: Record<string, unknown> = { step };

    if (step === 'schema' || step === 'all') {
      const schema = await ensureRdsSchema();
      results.schema = schema;
      if (!schema.ok) {
        return NextResponse.json(
          { error: schema.message, detail: schema.detail, results },
          { status: 500 },
        );
      }
    } else if (!(await isRdsSchemaReady())) {
      return NextResponse.json(
        {
          error: 'Database tables are missing',
          detail: 'Run step "all" or "schema" first, or use pnpm init:rds locally.',
        },
        { status: 400 },
      );
    }

    if (step === 'admin' || step === 'all') {
      try {
        results.admin = await bootstrapRdsAdmin();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message, results }, { status: 500 });
      }
    }

    if (step === 'seed' || step === 'all') {
      try {
        results.seed = await seedRdsBaseline();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message, results }, { status: 500 });
      }
    }

    const { body: statusBody } = await buildRdsStatus();

    return NextResponse.json({
      ok: true,
      message:
        step === 'schema'
          ? 'Schema synced to RDS.'
          : 'RDS ready: schema, admin, and sample categories/tests created.',
      results,
      status: statusBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[setup/rds] POST failed:', message);
    return NextResponse.json({ error: 'RDS setup failed', detail: message }, { status: 500 });
  }
}
