import { prisma } from '@/lib/prisma';
import { DSA_HARD_OPEN_PREFIX } from '@/lib/exams/dsa-hard-open-constants';
import { newOpenLinkToken } from '@/lib/exams/open-exam-link';
import { isUuidAttemptId } from '@/lib/db/resolve-test-id-for-insert';

export type EndOpenLinkResult =
  | { ok: true; message: string; examId: string; title: string }
  | { error: string };

function parseExamIdFromOverview(overviewId: string): string | null {
  if (overviewId.startsWith('exam:')) {
    const id = overviewId.slice('exam:'.length).trim();
    return isUuidAttemptId(id) ? id : null;
  }
  return null;
}

/** Immediately end an open-link / hard-open exam: closes join link and live window now. */
export async function endOpenLinkExamByOverviewId(overviewId: string): Promise<EndOpenLinkResult> {
  const examId = parseExamIdFromOverview(overviewId);
  if (!examId) {
    return { error: 'End test is only available for open-link exams from the Tests tab.' };
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      publishedTestId: true,
      openLinkEnabled: true,
      openLinkToken: true,
      facultyExamRequestId: true,
      status: true,
      endTime: true,
    },
  });
  if (!exam) return { error: 'Exam not found' };

  const testId = String(exam.publishedTestId ?? '').trim();
  const isHardOpen = testId.startsWith(DSA_HARD_OPEN_PREFIX);
  const wasOpenLink = exam.openLinkEnabled || isHardOpen || Boolean(exam.openLinkToken);
  if (!wasOpenLink) {
    return { error: 'This exam is not an open-link test.' };
  }

  const now = new Date();
  const alreadyEnded =
    exam.status === 'ended' ||
    (!exam.openLinkEnabled && exam.endTime.getTime() <= now.getTime());

  if (alreadyEnded) {
    return {
      ok: true,
      message: `Test "${exam.title}" is already ended.`,
      examId: exam.id,
      title: exam.title,
    };
  }

  await prisma.exam.update({
    where: { id: exam.id },
    data: {
      status: 'ended',
      openLinkEnabled: false,
      endTime: now,
      // Rotate token so old join URLs stop resolving immediately.
      openLinkToken: newOpenLinkToken(),
    },
  });

  // End any matching schedule windows so Live / faculty views drop immediately.
  const scheduleWhere =
    exam.facultyExamRequestId != null
      ? {
          OR: [
            { facultyExamRequestId: exam.facultyExamRequestId },
            ...(testId ? [{ testId }] : []),
          ],
        }
      : testId
        ? { testId }
        : null;

  if (scheduleWhere) {
    await prisma.examSchedule.updateMany({
      where: {
        ...scheduleWhere,
        status: { in: ['live', 'scheduled'] },
      },
      data: {
        status: 'ended',
        endsAt: now,
      },
    });
  }

  return {
    ok: true,
    message: `Test "${exam.title}" ended immediately. The open link is closed.`,
    examId: exam.id,
    title: exam.title,
  };
}
