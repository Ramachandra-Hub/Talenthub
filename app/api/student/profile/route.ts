/**
 * Student profile API — AWS RDS + Prisma + NextAuth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDbService } from '@/lib/db/get-db-service';
import type { UserProfile } from '@/lib/types';
import type { DbServiceClient } from '@/lib/db/get-db-service';

export const runtime = 'nodejs';

const PROFILE_METADATA_KEY = 'prep_profile';
const ALLOWED_FIELDS = [
  'full_name',
  'phone',
  'college',
  'branch',
  'cgpa',
  'resume_text',
  'resume_file_name',
  'resume_storage_path',
  'resume_updated_at',
] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

type ProfileUpdate = Partial<Record<AllowedField, string | number | null | undefined>>;

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
};

function isTableMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; status?: number };
  const message = String(e.message ?? '').toLowerCase();
  if (e.code === 'PGRST205' || e.code === '42P01') return true;
  if (e.status === 404 && message.includes('users')) return true;
  return (
    message.includes('users') &&
    (message.includes('could not find') ||
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('not found'))
  );
}

async function resolveAuthUser(): Promise<{ user: AuthUser | null; admin: DbServiceClient | null }> {
  const admin = getDbService();
  const session = await auth();
  if (!session?.user?.id) return { user: null, admin };

  const { data } = await admin.auth.admin.getUserById(session.user.id);
  const u = data?.user;
  if (!u) {
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        user_metadata: {},
      },
      admin,
    };
  }

  return {
    user: {
      id: u.id,
      email: u.email,
      user_metadata: u.user_metadata ?? {},
      created_at: new Date().toISOString(),
    },
    admin,
  };
}

function profileFromMetadata(user: AuthUser): UserProfile {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const saved = (metadata[PROFILE_METADATA_KEY] ?? {}) as Record<string, unknown>;

  const pick = (key: AllowedField): string | number | null => {
    const v = saved[key];
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return v;
    return String(v);
  };

  return {
    id: user.id,
    email: user.email ?? '',
    full_name:
      (pick('full_name') as string | null) ??
      ((metadata.full_name as string | undefined) ?? null) ??
      '',
    phone: (pick('phone') as string | null) ?? null,
    college: (pick('college') as string | null) ?? null,
    branch: (pick('branch') as string | null) ?? null,
    cgpa: (pick('cgpa') as number | null) ?? null,
    resume_text: (pick('resume_text') as string | null) ?? null,
    resume_file_name: (pick('resume_file_name') as string | null) ?? null,
    resume_storage_path: (pick('resume_storage_path') as string | null) ?? null,
    resume_updated_at: (pick('resume_updated_at') as string | null) ?? null,
    subscription_status: 'free',
    subscription_end_date: null,
    created_at:
      (saved.created_at as string | undefined) ??
      user.created_at ??
      new Date().toISOString(),
    updated_at:
      (saved.updated_at as string | undefined) ?? new Date().toISOString(),
  };
}

async function writeMetadataProfile(
  admin: DbServiceClient,
  user: AuthUser,
  updates: ProfileUpdate,
): Promise<{ ok: boolean; error: string | null }> {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const saved = (metadata[PROFILE_METADATA_KEY] ?? {}) as Record<string, unknown>;
  const next = {
    ...saved,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const newMetadata: Record<string, unknown> = {
    ...metadata,
    [PROFILE_METADATA_KEY]: next,
  };
  if (typeof updates.full_name === 'string') {
    newMetadata.full_name = updates.full_name;
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: newMetadata,
  });
  if (error) {
    const { readServiceError } = await import('@/lib/db/service-error');
    return { ok: false, error: readServiceError(error) ?? 'profile update failed' };
  }
  return { ok: true, error: null };
}

export async function GET(_request: NextRequest) {
  const { user, admin } = await resolveAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!admin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data: row, error } = await admin
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && row) {
    return NextResponse.json({ profile: row, source: 'public.users' });
  }

  if (error && isTableMissingError(error)) {
    return NextResponse.json({
      profile: profileFromMetadata(user),
      source: 'user_metadata',
      tableMissing: true,
    });
  }

  if (!row) {
    const payload = {
      id: user.id,
      email: user.email ?? '',
      full_name:
        (user.user_metadata?.full_name as string | undefined) ??
        ((user.user_metadata?.[PROFILE_METADATA_KEY] as Record<string, unknown> | undefined)
          ?.full_name as string | undefined) ??
        '',
      subscription_status: 'free',
    };
    const { data: inserted, error: insertError } = await admin
      .from('users')
      .insert([payload])
      .select('*')
      .single();
    if (!insertError && inserted) {
      return NextResponse.json({ profile: inserted, source: 'public.users' });
    }
    if (isTableMissingError(insertError)) {
      return NextResponse.json({
        profile: profileFromMetadata(user),
        source: 'user_metadata',
        tableMissing: true,
      });
    }
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not load profile' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: error?.message ?? 'Could not load profile' },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  const { user, admin } = await resolveAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!admin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: ProfileUpdate = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      const raw = body[key];
      if (raw === null || raw === undefined) {
        updates[key] = null;
      } else if (typeof raw === 'number') {
        updates[key] = raw;
      } else {
        updates[key] = String(raw);
      }
    }
  }

  const metaResult = await writeMetadataProfile(admin, user, updates);

  const upsertPayload: Record<string, unknown> = {
    id: user.id,
    email: user.email ?? '',
    subscription_status: 'free',
    updated_at: new Date().toISOString(),
    ...updates,
  };

  const { error: upsertError } = await admin
    .from('users')
    .upsert(upsertPayload, { onConflict: 'id' });

  if (!upsertError) {
    return NextResponse.json({
      ok: true,
      source: 'public.users',
      metadataBackup: metaResult.ok,
    });
  }

  if (isTableMissingError(upsertError)) {
    if (!metaResult.ok) {
      return NextResponse.json(
        { ok: false, error: metaResult.error ?? 'Could not save profile' },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      source: 'user_metadata',
      tableMissing: true,
      note: 'Saved to your auth account. Run prisma db push to create public.users on RDS.',
    });
  }

  return NextResponse.json(
    {
      ok: metaResult.ok,
      source: metaResult.ok ? 'user_metadata' : null,
      error: upsertError.message,
    },
    { status: metaResult.ok ? 200 : 500 },
  );
}
