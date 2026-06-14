import { NextResponse } from 'next/server';
import { deleteStudentsFromApplication } from '@/lib/admin/delete-student-admin';
import { resolveSlotRosterUsers } from '@/lib/admin/slot-roster-users';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type BulkDeleteBody = {
  userIds?: string[];
  academicYear?: string;
  scheduleId?: string;
};

export async function POST(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  let body: BulkDeleteBody;
  try {
    body = (await request.json()) as BulkDeleteBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let userIds = (body.userIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  let slotLabel: string | null = null;

  if (!userIds.length && body.scheduleId?.trim()) {
    const resolved = await resolveSlotRosterUsers(body.scheduleId.trim());
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 404 });
    }
    userIds = resolved.matched_user_ids;
    slotLabel = resolved.schedule_title;
    if (resolved.slot_number != null) {
      slotLabel = `${slotLabel} (Slot ${resolved.slot_number})`;
    }
    if (!userIds.length) {
      return NextResponse.json(
        {
          error: `No registered student accounts found for ${slotLabel}. Roster has ${resolved.roster_count} student${resolved.roster_count === 1 ? '' : 's'} — only students who have logged in at least once can be deleted here.`,
        },
        { status: 400 },
      );
    }
  }

  if (!userIds.length && body.academicYear?.trim()) {
    const year = body.academicYear.trim();
    const adminIds = new Set(
      (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
    );
    const rows = await prisma.user.findMany({
      where: {
        academicYear: year,
        userRole: { not: 'faculty' },
      },
      select: { id: true, email: true },
      take: 5000,
    });
    userIds = rows
      .filter((u) => !adminIds.has(u.id) && u.email && !u.email.includes('@admin.'))
      .map((u) => u.id);
  }

  if (!userIds.length) {
    return NextResponse.json({ error: 'No students selected for deletion' }, { status: 400 });
  }

  if (userIds.length > 500) {
    return NextResponse.json(
      { error: 'Too many students in one request (max 500). Delete in smaller batches.' },
      { status: 400 },
    );
  }

  const outcome = await deleteStudentsFromApplication(userIds, {
    preserveRoster: Boolean(body.scheduleId?.trim()),
  });
  const failed = outcome.results.filter((r): r is { userId: string; error: string } => 'error' in r);

  return NextResponse.json({
    ok: failed.length === 0,
    deleted: outcome.deleted,
    failed: failed.length,
    results: outcome.results,
    message:
      failed.length === 0
        ? `Deleted ${outcome.deleted} student${outcome.deleted === 1 ? '' : 's'}${slotLabel ? ` from ${slotLabel}` : ''}. Slot roster is kept — students can sign in again and re-attempt.`
        : `Deleted ${outcome.deleted} student${outcome.deleted === 1 ? '' : 's'}; ${failed.length} could not be removed.`,
  });
}
