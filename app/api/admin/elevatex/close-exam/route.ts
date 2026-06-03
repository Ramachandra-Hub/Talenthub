import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { reconcileElevateXStaleInProgressPrisma } from '@/lib/db/test-attempts-prisma';
import {
  closeElevateXExamWindowPrisma,
  finalizeOpenElevateXAttemptsAfterExamPrisma,
  isElevateXExamWindowOpenPrisma,
} from '@/lib/elevatex/exam-window';
import { loadElevateXAdminResultsPrisma } from '@/lib/admin/elevatex-results-prisma';

export const dynamic = 'force-dynamic';

/** Admin: force-close ElevateX in-progress rows and refresh submitted results. */
export async function POST() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  await reconcileElevateXStaleInProgressPrisma().catch(() => undefined);
  const windowClosed = await closeElevateXExamWindowPrisma();
  const closed = await finalizeOpenElevateXAttemptsAfterExamPrisma({ force: true });
  const examOpen = await isElevateXExamWindowOpenPrisma();
  const rows = await loadElevateXAdminResultsPrisma();
  const submitted = rows.filter((r) => r.submitted_at);

  return NextResponse.json({
    ok: true,
    exam_window_open: examOpen,
    modules_ended: windowClosed.modulesEnded,
    schedules_ended: windowClosed.schedulesEnded,
    attempts_closed: closed,
    submitted_count: submitted.length,
    with_scorecard: submitted.filter((r) => r.has_full_scorecard).length,
    refreshed_at: new Date().toISOString(),
  });
}
