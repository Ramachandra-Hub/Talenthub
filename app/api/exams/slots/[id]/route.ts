import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getDbService } from '@/lib/db/get-db-service';
import { parseScheduleSlotsJson } from '@/lib/exam-schedule-slots';
import { prisma } from '@/lib/prisma';
import {
  listPublishedProExamSlots,
  publishProExamSlot,
} from '@/lib/exams/publish-pro-exam-slot';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const slots = await listPublishedProExamSlots(id);
  const exam = await prisma.exam.findUnique({
    where: { id },
    select: { facultyExamRequestId: true },
  });
  const facultyRequest = exam?.facultyExamRequestId
    ? await prisma.facultyExamRequest.findUnique({
        where: { id: exam.facultyExamRequestId },
        select: { usesSlotScheduling: true, scheduleSlotsJson: true },
      })
    : null;
  return NextResponse.json({
    slots,
    uses_slot_scheduling: facultyRequest?.usesSlotScheduling ?? false,
    configured_slots: parseScheduleSlotsJson(facultyRequest?.scheduleSlotsJson),
  });
}

export async function POST(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slotNumber = Number(body.slot_number);
  const slots = parseScheduleSlotsJson(
    Array.isArray(body.slots) ? body.slots : body.slot ? [body.slot] : [],
  );
  const slot = slots.find((row) => row.slot_number === slotNumber);
  if (!slot) {
    return NextResponse.json({ error: 'Select a valid slot to publish.' }, { status: 400 });
  }

  try {
    const result = await publishProExamSlot(admin, {
      examId: id,
      adminUserId: auth.ctx.user.id,
      slot,
    });
    return NextResponse.json({
      ...result,
      message: `Slot ${result.slotNumber} published independently. Other slots remain unchanged.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not publish slot' },
      { status: 400 },
    );
  }
}
