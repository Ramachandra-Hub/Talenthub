import { NextRequest, NextResponse } from 'next/server';
import {
  listExamSlotScheduleOptions,
  resolveSlotRosterUsers,
} from '@/lib/admin/slot-roster-users';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const scheduleId = request.nextUrl.searchParams.get('scheduleId')?.trim();

  try {
    if (scheduleId) {
      const result = await resolveSlotRosterUsers(scheduleId);
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    const schedules = await listExamSlotScheduleOptions();
    return NextResponse.json({ schedules });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/admin/users/slot-roster]', message);
    return NextResponse.json({ error: 'Could not load slot roster' }, { status: 500 });
  }
}
