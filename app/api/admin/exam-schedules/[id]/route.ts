import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { examSchedulesMigrationHint } from '@/lib/db-migration-hints';
import { goLiveExamScheduleNow } from '@/lib/exam-schedule-slots';
import { goLiveElevateXSlot } from '@/lib/elevatex-admin';
import { isElevateXTestId } from '@/lib/elevatex';
import { deleteExamScheduleById } from '@/lib/delete-faculty-exam';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
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

  const action = typeof body.action === 'string' ? body.action : '';

  const { data: existing, error: fetchErr } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === 'go_live') {
    try {
      const updated = isElevateXTestId(String(existing.test_id ?? ''))
        ? await goLiveElevateXSlot(admin, id, auth.ctx.user.id)
        : await goLiveExamScheduleNow(admin, id, { openWindowNow: true });

      if (updated.status !== 'live') {
        throw new Error('Schedule status did not change to live');
      }
      return NextResponse.json({ schedule: updated });
    } catch (err) {
      console.error('[exam-schedules PATCH go_live]', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not go live' },
        { status: 400 },
      );
    }
  } else if (action === 'end') {
    patch.status = 'ended';
    if (!existing.ends_at) {
      patch.ends_at = new Date().toISOString();
    }
  } else if (action === 'update') {
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.notice === 'string') patch.notice = body.notice;
    if (typeof body.description === 'string') patch.description = body.description;
    if (typeof body.startsAt === 'string') {
      const d = new Date(body.startsAt);
      if (!Number.isNaN(d.getTime())) patch.starts_at = d.toISOString();
    }
    if (body.endsAt === null) patch.ends_at = null;
    if (typeof body.endsAt === 'string') {
      const d = new Date(body.endsAt);
      if (!Number.isNaN(d.getTime())) patch.ends_at = d.toISOString();
    }
    if (Array.isArray(body.targetDepartments)) patch.target_departments = body.targetDepartments;
    if (Array.isArray(body.targetYears)) patch.target_years = body.targetYears;
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await admin
    .from('exam_schedules')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (updateErr || !updated) {
    const msg = updateErr?.message ?? 'Update failed';
    const hint = examSchedulesMigrationHint(msg);
    return NextResponse.json({ error: hint ?? msg }, { status: 500 });
  }

  return NextResponse.json({ schedule: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const result = await deleteExamScheduleById(admin, id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Schedule deleted.' });
}
