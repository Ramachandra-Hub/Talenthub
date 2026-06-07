import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import {
  createConfirmedAuthUser,
  grantAdminRole,
  isUserAdmin,
  upsertPublicUser,
} from '@/lib/admin-access';
import { ensureAdminAccess } from '@/lib/admin-verify';
import {
  getConfiguredAdminEmail,
  getConfiguredAdminPassword,
} from '@/lib/admin-defaults';

type BootstrapBody = {
  email?: string;
  password?: string;
  fullName?: string;
};

function bootstrapAllowed(adminCount: number): boolean {
  if (adminCount === 0) return true;
  if (process.env.ALLOW_ADMIN_BOOTSTRAP === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.RDS_SETUP_SECRET?.trim();
    const header = request.headers.get('x-setup-secret')?.trim();
    if (!secret || header !== secret) {
      return NextResponse.json({ error: 'Bootstrap requires X-Setup-Secret in production.' }, { status: 403 });
    }
  }

  if (!process.env.AUTH_SECRET?.trim() || !process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ error: 'Configure AUTH_SECRET and DATABASE_URL' }, { status: 500 });
  }

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Configure AUTH_SECRET and DATABASE_URL' }, { status: 500 });
  }

  let body: BootstrapBody;
  try {
    body = (await request.json()) as BootstrapBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() || getConfiguredAdminEmail();
  const password = body.password || getConfiguredAdminPassword();
  const fullName = body.fullName?.trim() || 'RCE Training & Placement Admin';

  if (!email || password.length < 6) {
    return NextResponse.json(
      { error: 'Email required and password must be at least 6 characters.' },
      { status: 400 },
    );
  }

  const { count, error: countError } = await admin
    .from('admin_users')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    const msg = String(countError.message ?? '').toLowerCase();
    if (msg.includes('admin_users') && (msg.includes('schema') || msg.includes('does not exist'))) {
      await fetch(new URL('/api/setup/ensure-admin', request.url), { method: 'POST' });
    }
  }

  const adminCount = count ?? 0;
  if (!bootstrapAllowed(adminCount)) {
    return NextResponse.json(
      {
        error: 'Admin bootstrap is disabled in production after the first admin exists.',
        hint: 'Add your user_id to admin_users in AWS RDS, or set ALLOW_ADMIN_BOOTSTRAP=true.',
      },
      { status: 403 },
    );
  }

  await fetch(new URL('/api/setup/ensure-users', request.url), { method: 'POST' }).catch(() => null);
  await fetch(new URL('/api/setup/ensure-admin', request.url), { method: 'POST' }).catch(() => null);

  const created = await createConfirmedAuthUser(email, password, fullName);
  if ('error' in created) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  const profile = await upsertPublicUser(admin, created.id, email, fullName);
  const profileWarning = profile.ok ? null : profile.error ?? 'Profile row not created';

  const granted = await grantAdminRole(admin, created.id);
  const access = await ensureAdminAccess(admin, created.id, email);

  if (!granted.ok && !access.isAdmin) {
    return NextResponse.json(
      {
        error: granted.error ?? 'Could not grant admin role',
        hint: 'Run prisma db push or scripts/01-initial-schema.sql on RDS.',
        profileWarning,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    email,
    message: 'Admin account ready. Sign in at /auth/admin/login',
    loginUrl: '/auth/admin/login',
    profileWarning,
  });
}

/** Promote the currently signed-in user (service role verifies session from cookie). */
export async function PATCH(request: NextRequest) {
  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Configure AUTH_SECRET and DATABASE_URL' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization bearer token' }, { status: 401 });
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const user = userData.user;
  const { count } = await admin.from('admin_users').select('id', { count: 'exact', head: true });
  if (!bootstrapAllowed(count ?? 0)) {
    return NextResponse.json({ error: 'Bootstrap not allowed' }, { status: 403 });
  }

  await fetch(new URL('/api/setup/ensure-admin', request.url), { method: 'POST' }).catch(() => null);

  if (user.email) {
    await upsertPublicUser(admin, user.id, user.email, user.user_metadata?.full_name ?? 'Admin');
  }
  const granted = await grantAdminRole(admin, user.id);
  if (!granted.ok) {
    return NextResponse.json({ error: granted.error }, { status: 500 });
  }

  const isAdmin = await isUserAdmin(admin, user.id);
  return NextResponse.json({ success: true, isAdmin });
}
