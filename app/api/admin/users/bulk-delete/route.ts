import { NextResponse } from 'next/server';
import { deleteStudentsFromApplication } from '@/lib/admin/delete-student-admin';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type BulkDeleteBody = {
  userIds?: string[];
  academicYear?: string;
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

  const outcome = await deleteStudentsFromApplication(userIds);
  const failed = outcome.results.filter((r): r is { userId: string; error: string } => 'error' in r);

  return NextResponse.json({
    ok: failed.length === 0,
    deleted: outcome.deleted,
    failed: failed.length,
    results: outcome.results,
    message:
      failed.length === 0
        ? `Deleted ${outcome.deleted} student${outcome.deleted === 1 ? '' : 's'} from the application.`
        : `Deleted ${outcome.deleted} student${outcome.deleted === 1 ? '' : 's'}; ${failed.length} could not be removed.`,
  });
}
