import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { examSchedulesMigrationHint } from '@/lib/db-migration-hints';
import { goLiveExamScheduleNow } from '@/lib/exam-schedule-slots';
import { goLiveElevateXSlot } from '@/lib/elevatex-admin';
import { isElevateXTestId } from '@/lib/elevatex';
import { deleteExamScheduleById } from '@/lib/delete-faculty-exam';
import { finalizeAttemptsForEndedSchedulePrisma } from '@/lib/exam-schedule-sync';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

type RouteContext = { params: Promise<{ id: string }> };

function mapPrismaSchedule(row: {
  id: string;
  testId: string | null;
  title: string | null;
  description: string | null;
  notice: string | null;
  facultyExamRequestId: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  targetDepartments: unknown;
  targetYears: unknown;
  slotNumber: number | null;
  slotCapacity: number | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    title: row.title ?? 'Exam',
    description: row.description,
    notice: row.notice,
    faculty_exam_request_id: row.facultyExamRequestId,
    test_id: row.testId ?? '',
    status: row.status,
    starts_at: row.startsAt?.toISOString() ?? new Date().toISOString(),
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: Array.isArray(row.targetDepartments)
      ? (row.targetDepartments as string[])
      : [],
    target_years: Array.isArray(row.targetYears) ? (row.targetYears as string[]) : [],
    slot_number: row.slotNumber,
    slot_capacity: row.slotCapacity,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

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

    const rescheduling =
      patch.starts_at != null || patch.ends_at !== undefined || patch.title != null;
    if (rescheduling && existing.status === 'ended') {
      patch.status = 'scheduled';
    }
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await admin
    .from('exam_schedules')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (!updateErr && updated) {
    if (action === 'end') {
      void finalizeAttemptsForEndedSchedulePrisma(id).catch((err) => {
        console.warn('[exam-schedules PATCH end] finalize attempts:', err);
      });
    }
    return NextResponse.json({ schedule: updated });
  }

  if (action === 'update') {
    try {
      const prismaPatch: Prisma.ExamScheduleUpdateInput = {
        updatedAt: new Date(),
      };
      if (typeof patch.title === 'string') prismaPatch.title = patch.title;
      if (typeof patch.notice === 'string') prismaPatch.notice = patch.notice;
      if (typeof patch.description === 'string') prismaPatch.description = patch.description;
      if (typeof patch.starts_at === 'string') prismaPatch.startsAt = new Date(patch.starts_at);
      if (patch.ends_at === null) prismaPatch.endsAt = null;
      if (typeof patch.ends_at === 'string') prismaPatch.endsAt = new Date(patch.ends_at);
      if (Array.isArray(patch.target_departments)) {
        prismaPatch.targetDepartments = patch.target_departments as Prisma.InputJsonValue;
      }
      if (Array.isArray(patch.target_years)) {
        prismaPatch.targetYears = patch.target_years as Prisma.InputJsonValue;
      }
      if (patch.status === 'scheduled') prismaPatch.status = 'scheduled';
      if (patch.status === 'ended') {
        prismaPatch.status = 'ended';
        if (typeof patch.ends_at === 'string') prismaPatch.endsAt = new Date(patch.ends_at);
      }

      const row = await prisma.examSchedule.update({
        where: { id },
        data: prismaPatch,
      });
      if (patch.status === 'ended') {
        void finalizeAttemptsForEndedSchedulePrisma(id).catch((err) => {
          console.warn('[exam-schedules PATCH end/prisma] finalize attempts:', err);
        });
      }
      return NextResponse.json({ schedule: mapPrismaSchedule(row) });
    } catch (prismaErr) {
      const msg =
        updateErr?.message ??
        (prismaErr instanceof Error ? prismaErr.message : 'Update failed');
      const hint = examSchedulesMigrationHint(msg);
      return NextResponse.json({ error: hint ?? msg }, { status: 500 });
    }
  }

  const msg = updateErr?.message ?? 'Update failed';
  const hint = examSchedulesMigrationHint(msg);
  return NextResponse.json({ error: hint ?? msg }, { status: 500 });
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
