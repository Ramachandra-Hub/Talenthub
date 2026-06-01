import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { useAwsStack } from '@/lib/aws/stack';
import { getLiveExamAccessPolicyPrisma } from '@/lib/db/exam-access-policy-prisma';
import { isScheduleWindowOpen, type ExamScheduleRow } from '@/lib/exam-schedule';
import { testIdsMatch } from '@/lib/test-attempts';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ testId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { testId } = await context.params;

  if (useAwsStack()) {
    const policy = await getLiveExamAccessPolicyPrisma(testId ?? '');
    return NextResponse.json(policy);
  }

  const admin = getDbService();
  if (!admin || !testId?.trim()) {
    return NextResponse.json({ loginRequired: false });
  }

  const { data } = await admin.from('exam_schedules').select('*');
  const schedules = ((data ?? []) as ExamScheduleRow[]).filter((s) =>
    testIdsMatch(s.test_id, testId.trim()),
  );

  const now = Date.now();
  const live = schedules.filter((s) => isScheduleWindowOpen(s, now));
  if (!live.length) {
    return NextResponse.json({ loginRequired: false });
  }

  return NextResponse.json({
    loginRequired: true,
    liveExamTitle: live[0]?.title ?? null,
  });
}
