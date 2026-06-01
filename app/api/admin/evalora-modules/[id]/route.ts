import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const body = (await request.json()) as { action?: string };
  const action = body.action ?? '';

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === 'go_live') {
    patch.status = 'live';
    patch.starts_at = new Date().toISOString();
  } else if (action === 'end') {
    patch.status = 'ended';
    patch.ends_at = new Date().toISOString();
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { data: rows, error } = await admin
    .from('evalora_module_schedules')
    .update(patch)
    .eq('id', id);

  const data = Array.isArray(rows) ? rows[0] : rows;
  if (!error && data) {
    return NextResponse.json({ schedule: data });
  }

  if (action === 'go_live' || action === 'end') {
    try {
      const row = await prisma.evaloraModuleSchedule.update({
        where: { id },
        data:
          action === 'go_live'
            ? { status: 'live', startsAt: new Date() }
            : { status: 'ended', endsAt: new Date() },
      });
      return NextResponse.json({
        schedule: {
          id: row.id,
          module_key: row.moduleKey,
          title: row.title,
          notice: row.notice,
          status: row.status,
          starts_at: row.startsAt.toISOString(),
          ends_at: row.endsAt?.toISOString() ?? null,
          target_departments: row.targetDepartments,
          target_years: row.targetYears,
        },
      });
    } catch (prismaErr) {
      const msg = error?.message ?? (prismaErr instanceof Error ? prismaErr.message : 'Update failed');
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const { error } = await admin.from('evalora_module_schedules').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Module schedule deleted.' });
}
