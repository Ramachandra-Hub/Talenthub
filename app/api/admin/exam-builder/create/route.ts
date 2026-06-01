import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { parseQuestionsJson } from '@/lib/faculty-exams';
import { getExamBuilderTestType } from '@/lib/exam-builder/test-catalog';
import { drawExamQuestionsFromTopics } from '@/lib/exam-builder/draw-questions';
import { createFacultyExamRequestRecord } from '@/lib/exam-builder/create-exam-request';
import { isValidAcademicYear } from '@/lib/roles';
import { DEPARTMENTS } from '@/lib/college-brand';
import {
  ELEVATEX_PLACEHOLDER_QUESTIONS,
  isElevateXBuilderTestType,
  studentTakeUrlForTestId,
} from '@/lib/exam-builder/elevatex-exam';
import { parseScheduleSlotsJson } from '@/lib/exam-schedule-slots';
import { syncElevateXEvaloraModuleFromSchedule } from '@/lib/elevatex-admin';

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

  const testType = String(body.testType ?? 'aptitude');
  const def = getExamBuilderTestType(testType);
  if (!def) return NextResponse.json({ error: 'Invalid test type' }, { status: 400 });

  const isElevateX = isElevateXBuilderTestType(testType);
  const usesSlotScheduling = Boolean(body.usesSlotScheduling);
  const scheduleSlots = usesSlotScheduling ? parseScheduleSlotsJson(body.scheduleSlots) : [];

  if (isElevateX && !usesSlotScheduling) {
    return NextResponse.json(
      { error: 'ElevateX requires 8-slot scheduling with student roster.' },
      { status: 400 },
    );
  }

  const title = String(body.title ?? '').trim() || `${def.name} Examination`;
  const slotKey = String(body.slotKey ?? 'slot-1');
  const topicIds = Array.isArray(body.topicIds) ? (body.topicIds as string[]) : [];
  const questionsPerTopic = Number(body.questionsPerTopic) || def.defaultQuestionsPerTopic;
  const durationMinutes = Number(body.durationMinutes) || def.defaultDurationMinutes;
  const targetYears = (Array.isArray(body.targetYears) ? body.targetYears : []).filter((y) =>
    isValidAcademicYear(String(y)),
  );
  const primaryDepartment = String(body.department ?? '').trim();
  const departmentGroupId =
    typeof body.departmentGroupId === 'string' && body.departmentGroupId
      ? body.departmentGroupId
      : null;
  const extraBranches = Array.isArray(body.extraBranches)
    ? (body.extraBranches as string[])
    : [];
  const goLiveNow = Boolean(body.goLiveNow) && !usesSlotScheduling;
  const goLiveSlotNumbersRaw = Array.isArray(body.goLiveSlotNumbers) ? body.goLiveSlotNumbers : [];
  const goLiveSlotNumbers = goLiveSlotNumbersRaw
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 8)
    .slice(0, 1);

  let questions = parseQuestionsJson(body.questions);

  if (isElevateX) {
    questions = ELEVATEX_PLACEHOLDER_QUESTIONS;
  } else if (!questions.length && def.requiresSyllabus) {
    if (!topicIds.length) {
      return NextResponse.json({ error: 'Select syllabus topics or provide questions' }, { status: 400 });
    }
    try {
      const drawn = await drawExamQuestionsFromTopics(admin, {
        testType,
        topicIds,
        questionsPerTopic,
        slotKey,
        createdBy: auth.ctx.user.id,
      });
      questions = drawn.questions;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Draw failed' },
        { status: 400 },
      );
    }
  }

  if (!questions.length) {
    return NextResponse.json({ error: 'No questions to publish' }, { status: 400 });
  }

  if (!targetYears.length) {
    return NextResponse.json({ error: 'Select at least one target year' }, { status: 400 });
  }

  const resolvedDept =
    primaryDepartment && primaryDepartment !== 'All departments'
      ? primaryDepartment
      : DEPARTMENTS[0];

  try {
    const result = await createFacultyExamRequestRecord(admin, {
      creatorUserId: auth.ctx.user.id,
      primaryDepartment: resolvedDept,
      title,
      description:
        typeof body.description === 'string'
          ? body.description
          : `${def.name} · ${slotKey}`,
      topic: def.name,
      targetYears,
      extraBranches,
      departmentGroupId,
      durationMinutes,
      questions,
      testType,
      slotKey,
      syllabusTopicIds: topicIds,
      questionsPerTopic,
      status: 'approved',
      autoPublish: true,
      autoGoLive: goLiveNow,
      goLiveNotice:
        typeof body.notice === 'string' ? body.notice : `${def.name} is now live for your group.`,
      usesSlotScheduling,
      scheduleSlots: usesSlotScheduling ? scheduleSlots : undefined,
      goLiveSlotNumbers: usesSlotScheduling ? goLiveSlotNumbers : undefined,
    });

    const goLiveMsg =
      goLiveSlotNumbers.includes(1)
        ? ' Slot 1 is live. End Slot 1, then go live Slot 2, and so on from Exam schedules.'
        : '';

    if (isElevateX && goLiveSlotNumbers.includes(1) && result.requestId) {
      const { data: slot1 } = await admin
        .from('exam_schedules')
        .select('*')
        .eq('faculty_exam_request_id', result.requestId)
        .eq('slot_number', 1)
        .maybeSingle();
      if (slot1) {
        await syncElevateXEvaloraModuleFromSchedule(
          admin,
          {
            starts_at: slot1.starts_at,
            ends_at: slot1.ends_at,
            notice:
              typeof body.notice === 'string'
                ? body.notice
                : `${def.name} · Slot 1`,
          },
          auth.ctx.user.id,
        );
      }
    }

    return NextResponse.json({
      requestId: result.requestId,
      testId: result.testId,
      scheduleId: result.scheduleId,
      takeUrl: result.testId ? studentTakeUrlForTestId(result.testId) : undefined,
      targetDepartments: [result.department, ...result.target_branches],
      message: usesSlotScheduling
        ? isElevateX
          ? `ElevateX published with configured slot(s).${goLiveMsg} Add Slots 2–8 later from ElevateX & modules or Exam schedules.`
          : `Exam published with slot schedules.${goLiveMsg} Open slots one at a time from Exam schedules.`
        : goLiveNow
          ? 'Exam published and is live for the selected department group.'
          : 'Exam published. Go live from Exam schedules when ready.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Publish failed' },
      { status: 500 },
    );
  }
}
