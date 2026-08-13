import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { autoEnsureRdsSchema } from '@/lib/db/auto-ensure-rds';
import { requireAuth } from '@/lib/server-auth';
import { isValidAcademicYear } from '@/lib/roles';
import { DEPARTMENTS } from '@/lib/college-brand';
import { publishProExam } from '@/lib/exams/publish-pro-exam';

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const schema = await autoEnsureRdsSchema();
  if (!schema.ok && !schema.skipped) {
    return NextResponse.json({ error: schema.message }, { status: 503 });
  }

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const targetYears = (Array.isArray(body.targetYears) ? body.targetYears : []).filter((y) =>
    isValidAcademicYear(String(y)),
  );
  const primaryDepartment = String(body.department ?? '').trim();
  const departmentGroupId =
    typeof body.departmentGroupId === 'string' && body.departmentGroupId
      ? body.departmentGroupId
      : null;
  const usesSlotScheduling = Boolean(body.usesSlotScheduling);
  const resolvedDept =
    primaryDepartment && primaryDepartment !== 'All departments'
      ? primaryDepartment
      : DEPARTMENTS[0] ?? '';

  try {
    const result = await publishProExam(admin, {
      examId: id,
      creatorUserId: auth.ctx.user.id,
      primaryDepartment: resolvedDept,
      departmentGroupId,
      targetYears,
      usesSlotScheduling,
      scheduleSlots: body.scheduleSlots,
      questionsPerSubject: Number(body.questionsPerSubject) || 5,
      codingProblemsPerSubject: Number(body.codingProblemsPerSubject) || 3,
      openLinkEnabled: Boolean(body.openLinkEnabled),
    });

    return NextResponse.json({
      ...result,
      message: result.openLinkPath
        ? 'Exam published with an open join link. Anyone with the link can sign in using roll number, the default password, branch, and year.'
        : 'Exam published and scheduled. Students can take it from their portal; use Live Dashboard and Test Reports for results and PDF exports.',
      links: {
        liveDashboard: '/admin/live-dashboard',
        testReports: '/admin/reports',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
