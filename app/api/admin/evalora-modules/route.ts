import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { EVALORA_MODULES, type EvaloraModuleKey } from '@/lib/evalora/modules';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const { data: schedules } = await admin
    .from('evalora_module_schedules')
    .select('*')
    .order('starts_at', { ascending: false });

  return NextResponse.json({
    modules: EVALORA_MODULES,
    schedules: schedules ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const moduleKey = String(body.moduleKey ?? '') as EvaloraModuleKey;
  const def = EVALORA_MODULES.find((m) => m.key === moduleKey);
  if (!def) {
    return NextResponse.json({ error: 'Invalid moduleKey' }, { status: 400 });
  }

  const goLiveNow = Boolean(body.goLiveNow);
  const startsAtRaw = typeof body.startsAt === 'string' ? body.startsAt : '';
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : new Date();
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid startsAt' }, { status: 400 });
  }

  const endsAtRaw = typeof body.endsAt === 'string' && body.endsAt ? body.endsAt : null;
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid endsAt' }, { status: 400 });
  }

  const { data: created, error } = await admin
    .from('evalora_module_schedules')
    .insert({
      module_key: moduleKey,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : def.name,
      notice: typeof body.notice === 'string' ? body.notice : null,
      status: goLiveNow ? 'live' : 'scheduled',
      starts_at: goLiveNow ? new Date().toISOString() : startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      target_departments: Array.isArray(body.targetDepartments)
        ? (body.targetDepartments as string[])
        : [],
      target_years: Array.isArray(body.targetYears) ? (body.targetYears as string[]) : [],
      created_by: auth.ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  return NextResponse.json({ schedule: created });
}
