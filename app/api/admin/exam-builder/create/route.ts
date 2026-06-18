import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { autoEnsureRdsSchema } from '@/lib/db/auto-ensure-rds';
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
import {
  filterConfiguredScheduleSlots,
  parseScheduleSlotsJson,
  scheduleWindowFromConfiguredSlots,
} from '@/lib/exam-schedule-slots';
import { syncElevateXEvaloraModuleFromSchedule } from '@/lib/elevatex-admin';
import {
  mergeElevateXTechnicalFormats,
  serializeElevateXTechnicalConfig,
  type ElevateXTechnicalFormatsMap,
} from '@/lib/placement/elevatex-technical-config';

/** Publishing + roster provision can exceed the default 10s on Vercel. */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const schema = await autoEnsureRdsSchema();
  if (!schema.ok && !schema.skipped) {
    return NextResponse.json(
      {
        error: schema.message,
        hint: schema.detail ?? 'Run POST /api/setup/rds or pnpm init:rds against your DATABASE_URL.',
      },
      { status: 503 },
    );
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

  const elevateXTechnicalFormats = isElevateX
    ? mergeElevateXTechnicalFormats(
        body.technicalFormats && typeof body.technicalFormats === 'object'
          ? (body.technicalFormats as ElevateXTechnicalFormatsMap)
          : null,
      )
    : null;

  try {
    const result = await createFacultyExamRequestRecord(admin, {
      creatorUserId: auth.ctx.user.id,
      primaryDepartment: resolvedDept,
      title,
      description:
        typeof body.description === 'string'
          ? body.description
          : `${def.name} · ${slotKey}`,
      topic: isElevateX
        ? serializeElevateXTechnicalConfig(elevateXTechnicalFormats!)
        : def.name,
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
    });

    const configuredElevateXSlots = isElevateX
      ? filterConfiguredScheduleSlots(scheduleSlots)
      : [];
    const elevateXSlotCount = configuredElevateXSlots.length;

    if (isElevateX && result.requestId && elevateXSlotCount > 0) {
      try {
        const window = scheduleWindowFromConfiguredSlots(configuredElevateXSlots);
        await syncElevateXEvaloraModuleFromSchedule(
          admin,
          {
            ...window,
            notice:
              typeof body.notice === 'string'
                ? body.notice
                : `${def.name} · ${elevateXSlotCount} slot(s) scheduled`,
          },
          auth.ctx.user.id,
        );
      } catch (syncErr) {
        console.warn('[exam-builder/create] ElevateX module sync:', syncErr);
      }
    }

    const configuredSlotCount = usesSlotScheduling
      ? filterConfiguredScheduleSlots(scheduleSlots).length
      : 0;

    return NextResponse.json({
      requestId: result.requestId,
      testId: result.testId,
      scheduleId: result.scheduleId,
      takeUrl: result.testId ? studentTakeUrlForTestId(result.testId) : undefined,
      targetDepartments: [result.department, ...result.target_branches],
      message: usesSlotScheduling
        ? configuredSlotCount > 0
          ? isElevateX
            ? `ElevateX published with ${configuredSlotCount} live slot(s). Students see the exam on their portal and can start only during their roster slot (by roll number).`
            : `Exam published with ${configuredSlotCount} live slot(s). Students on each slot roster see it on their portal during that slot time.`
          : isElevateX
            ? 'ElevateX published. Configure Slot 1 with date, time, and roster, then publish again.'
            : 'Exam published. Complete slot date, time, and roster before students can take it.'
        : goLiveNow
          ? 'Exam published and is live for the selected department group.'
          : 'Exam published. Go live from Exam schedules when ready.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    console.error('[exam-builder/create]', err);
    const lower = message.toLowerCase();
    let hint: string | undefined;
    if (lower.includes('slot 1') || lower.includes('configure slot')) {
      hint = 'Complete Slot 1 date, time, and roster, then publish again.';
    } else if (lower.includes('student login') || lower.includes('roster')) {
      hint =
        'Roster login provisioning had issues — the exam may still be saved. Check DATABASE_URL, then use /api/setup/elevatex-credentials if needed.';
    } else if (lower.includes('exam schedule') || lower.includes('target_departments')) {
      hint = 'Schedule insert failed — run POST /api/setup/rds to sync exam_schedules columns, then retry.';
    } else if (lower.includes('does not exist') || lower.includes('column')) {
      hint = 'Database schema is out of date. Run POST /api/setup/rds from an admin session, wait 30s, retry.';
    }
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
