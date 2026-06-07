import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { getAuthSetupErrors } from '@/lib/auth/config-check';
import { ensureAdminUser } from '@/lib/roles-prisma';
import {
  getConfiguredAdminEmail,
  getConfiguredAdminPassword,
  isAllowlistedAdminEmail,
} from '@/lib/admin-defaults';
import { adminAuthEmail } from '@/lib/college-auth';
import { ensureSchemaForAuth } from '@/lib/db/ensure-schema-for-auth';
import { bootstrapRdsAdmin } from '@/lib/db/seed-rds-baseline';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { prisma } from '@/lib/prisma';
import { guardLoginAttempt } from '@/lib/auth/login-rate-limit';
import { safeAuthHint } from '@/lib/auth/safe-auth-hint';

export async function POST(request: NextRequest) {
  const loginDenied = guardLoginAttempt(request, 'admin');
  if (loginDenied) return loginDenied;

  const setupErrors = getAuthSetupErrors();
  if (setupErrors.length) {
    return NextResponse.json(
      {
        error: 'Login is not configured on this server.',
        hint: safeAuthHint(
          setupErrors.join(' '),
          'Contact the examination cell or platform administrator.',
        ),
      },
      { status: 503 },
    );
  }

  let body: { email?: string; password?: string; username?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const emailInput = (body.email ?? body.username ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  if (!emailInput || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const normalizedEmail = adminAuthEmail(emailInput);

  const idDenied = guardLoginAttempt(request, 'admin', normalizedEmail);
  if (idDenied) return idDenied;

  try {
    await ensureSchemaForAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'Database not ready for login.',
        hint: safeAuthHint(message, 'Try again in a few minutes or contact support.'),
      },
      { status: 503 },
    );
  }

  const existingAdminCount = await prisma.adminUser.count();
  if (
    existingAdminCount === 0 &&
    isAllowlistedAdminEmail(normalizedEmail) &&
    password === getConfiguredAdminPassword()
  ) {
    try {
      await bootstrapRdsAdmin();
    } catch (err) {
      console.error('[admin signin] bootstrap failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      const { remediation } = classifyDatabaseError(message);
      return NextResponse.json(
        {
          error: 'Could not create admin account in database.',
          hint: safeAuthHint(
            remediation[0] ?? message,
            'Database setup failed. Contact the examination cell.',
          ),
        },
        { status: 503 },
      );
    }
  }

  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn('admin', {
      username: emailInput,
      password,
      redirect: false,
    });
  } catch (err) {
    console.error('[admin signin] signIn failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    return NextResponse.json(
      {
        error: 'Sign-in failed.',
        hint: safeAuthHint(remediation[0] ?? message, 'Sign-in failed. Try again later.'),
      },
      { status: 503 },
    );
  }

  if (result?.error) {
    const isProd =
      process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const hint = isProd
      ? ' Contact the examination cell if you forgot your admin credentials.'
      : ' Check PREPINDIA_ADMIN_EMAIL and PREPINDIA_ADMIN_PASSWORD in your environment.';
    return NextResponse.json(
      {
        error: 'Invalid email or password.',
        hint,
      },
      { status: 401 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (user) {
      await ensureAdminUser(user.id);
    }

    return NextResponse.json({
      success: true,
      email: user?.email ?? normalizedEmail,
      userId: user?.id,
    });
  } catch (err) {
    console.error('[admin signin] post-auth lookup failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    return NextResponse.json(
      {
        error: 'Database connection failed.',
        hint: safeAuthHint(remediation[0] ?? message, 'Database connection failed. Try again later.'),
      },
      { status: 503 },
    );
  }
}
