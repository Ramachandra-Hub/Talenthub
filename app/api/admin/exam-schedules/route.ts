import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import type { ExamScheduleStatus } from '@/lib/exam-schedule';
import {
  examSchedulesMigrationHint,
  isMissingTableOrColumnError,
} from '@/lib/db-migration-hints';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { syncExpiredLiveExamSchedules } from '@/lib/exam-schedule-sync';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const warnings: string[] = [];

  const { data: schedules, error: schedulesError } = await admin
    .from('exam_schedules')
    .select(
      'id, title, description, notice, faculty_exam_request_id, test_id, status, starts_at, ends_at, target_departments, target_years, created_by, created_at, updated_at',
    )
    .order('starts_at', { ascending: false });

  if (schedulesError) {
    const msg = schedulesError.message ?? '';
    if (msg.includes('exam_schedules') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
      warnings.push('Run prisma db push or scripts/01-initial-schema.sql on RDS.');
    } else {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const approvedSelectFull =
    'id, title, topic, department, target_years, target_branches, duration_minutes, published_test_id, status';
  const approvedSelectMin =
    'id, title, department, target_years, duration_minutes, published_test_id, status';

  let { data: approved, error: approvedError } = await admin
    .from('faculty_exam_requests')
    .select(approvedSelectFull)
    .eq('status', 'approved')
    .not('published_test_id', 'is', null)
    .order('created_at', { ascending: false });

  if (approvedError && isMissingTableOrColumnError(approvedError.message ?? '')) {
    ({ data: approved, error: approvedError } = await admin
      .from('faculty_exam_requests')
      .select(approvedSelectMin)
      .eq('status', 'approved')
      .not('published_test_id', 'is', null)
      .order('created_at', { ascending: false }));
  }

  if (approvedError) {
    return NextResponse.json({ error: approvedError.message }, { status: 500 });
  }

  let scheduleList = (schedules ?? []) as ExamScheduleRow[];
  if (scheduleList.length > 0) {
    scheduleList = await syncExpiredLiveExamSchedules(admin, scheduleList);
  }

  return NextResponse.json({
    schedules: scheduleList,
    approvedExams: approved ?? [],
    warnings: warnings.length ? warnings : undefined,
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

  const facultyExamRequestId =
    typeof body.facultyExamRequestId === 'string' ? body.facultyExamRequestId : '';
  if (!facultyExamRequestId) {
    return NextResponse.json({ error: 'facultyExamRequestId is required' }, { status: 400 });
  }

  const { data: examRow, error: examErr } = await admin
    .from('faculty_exam_requests')
    .select(
      'id, title, description, department, target_years, target_branches, published_test_id, status',
    )
    .eq('id', facultyExamRequestId)
    .maybeSingle();

  if (examErr || !examRow) {
    return NextResponse.json({ error: 'Faculty exam not found' }, { status: 404 });
  }
  if (examRow.status !== 'approved' || !examRow.published_test_id) {
    return NextResponse.json({ error: 'Exam must be approved with a published test' }, { status: 400 });
  }

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

  if (Boolean(body.goLiveNow)) {
    return NextResponse.json(
      {
        error:
          'Exams must be saved as scheduled first, then use Go live.',
      },
      { status: 400 },
    );
  }

  const status: ExamScheduleStatus = 'scheduled';

  const targetDepartments = Array.isArray(body.targetDepartments)
    ? (body.targetDepartments as string[])
    : [examRow.department as string, ...((examRow.target_branches as string[]) ?? [])];

  const targetYears = Array.isArray(body.targetYears)
    ? (body.targetYears as string[])
    : ((examRow.target_years as string[]) ?? []);

  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : (examRow.title as string);

  const { data: created, error: insertErr } = await admin
    .from('exam_schedules')
    .insert({
      title,
      description:
        typeof body.description === 'string'
          ? body.description
          : ((examRow.description as string | null) ?? null),
      notice: typeof body.notice === 'string' ? body.notice : null,
      faculty_exam_request_id: facultyExamRequestId,
      test_id: examRow.published_test_id as string,
      status,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      target_departments: targetDepartments,
      target_years: targetYears,
      created_by: auth.ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (insertErr || !created) {
    const msg = insertErr?.message ?? 'Could not create schedule';
    const hint = examSchedulesMigrationHint(msg);
    return NextResponse.json({ error: hint ?? msg }, { status: 500 });
  }

  return NextResponse.json({ schedule: created });
}
