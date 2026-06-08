import { buildFeedEntry, pushDashboardFeedEntry } from '@/lib/dashboard-feed';
import { LOCAL_ATTEMPT_GUEST_USER_ID, saveLocalTestAttempt } from '@/lib/local-test-attempts';
import { fetchWithSession, getClientUser } from '@/lib/client-auth';
import type { Test } from '@/lib/types';
import {
  cacheApiAttempts,
  type DashboardAttemptView,
} from '@/lib/test-attempts';
import { slimAnswersForSubmit } from '@/lib/exam-v2/sanitize-answers';
import { fetchSubmitWithRetry } from '@/lib/submit-with-retry';

export type ExamKind = 'practice' | 'programming' | 'department' | 'competitive';

export type RecordDashboardAttemptInput = {
  testId: string;
  testName: string;
  /** Live exam autosave row — final submit updates this attempt instead of creating a duplicate. */
  attemptId?: string;
  scorePercent: number;
  rawNetScore?: number;
  elapsedSec?: number;
  examKind?: ExamKind;
  answers?: Record<string, unknown>;
  proctorSessionId?: string;
  proctorViolations?: number;
  proctorAutoSubmit?: boolean;
  accessBranch?: string;
  accessYear?: string;
  accessRollNumber?: string;
  test?: Pick<Test, 'id' | 'name' | 'category_id' | 'duration' | 'total_questions'>;
};

export type RecordDashboardAttemptResult = {
  attemptId: string;
  savedToServer: boolean;
  alreadyCompleted?: boolean;
  error?: string;
};

function minimalTest(input: RecordDashboardAttemptInput): Test {
  const now = new Date().toISOString();
  return {
    id: input.test?.id ?? input.testId,
    name: input.testName,
    category_id: input.test?.category_id ?? '',
    duration: input.test?.duration ?? 0,
    total_questions: input.test?.total_questions ?? 0,
    passing_score: null,
    description: null,
    difficulty_level: null,
    is_paid: false,
    created_at: now,
    updated_at: now,
  };
}

export async function recordDashboardAttempt(
  input: RecordDashboardAttemptInput,
): Promise<RecordDashboardAttemptResult | null> {
  const user = await getClientUser();
  const ownerId = user?.id ?? LOCAL_ATTEMPT_GUEST_USER_ID;
  const nowIso = new Date().toISOString();
  const elapsedSec = input.elapsedSec ?? 0;
  const test = minimalTest(input);

  if (!user) {
    const localAttemptId = `local-${input.examKind ?? 'practice'}-${Date.now()}`;
    const localPayload = {
      attempt: {
        id: localAttemptId,
        user_id: ownerId,
        test_id: input.testId,
        started_at: nowIso,
        completed_at: nowIso,
        score: input.scorePercent,
        answers: null,
        time_taken: elapsedSec,
        status: 'completed' as const,
        created_at: nowIso,
      },
      test,
    };
    saveLocalTestAttempt(ownerId, localAttemptId, localPayload);
    pushDashboardFeedEntry(
      ownerId,
      buildFeedEntry({
        id: localAttemptId,
        userId: ownerId,
        testId: input.testId,
        testName: input.testName,
        scorePercent: input.scorePercent,
        elapsedSec,
        completedAtIso: nowIso,
      }),
    );
    return { attemptId: localAttemptId, savedToServer: false };
  }

  let savedToServer = false;
  let attemptId = `local-${input.examKind ?? 'practice'}-${Date.now()}`;

  try {
    const res = await fetchSubmitWithRetry(() =>
      fetchWithSession('/api/student/test-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId: input.testId,
          testName: input.testName,
          attemptId: input.attemptId,
          scorePercent: input.scorePercent,
          rawNetScore: input.rawNetScore ?? input.scorePercent,
          elapsedSec,
          startedAtIso: nowIso,
          completedAtIso: nowIso,
          examKind: input.examKind,
          answers: input.answers ? slimAnswersForSubmit(input.answers) : undefined,
          proctorSessionId: input.proctorSessionId,
          proctorViolations: input.proctorViolations ?? 0,
          proctorAutoSubmit: input.proctorAutoSubmit ?? false,
          accessBranch: input.accessBranch,
          accessYear: input.accessYear,
          accessRollNumber: input.accessRollNumber,
        }),
      }),
    );

    if (res.status === 409) {
      const json = (await res.json()) as {
        attemptId?: string;
        priorAttempt?: { id?: string };
        error?: string;
        code?: string;
      };
      if (json.code === 'deadline_exceeded') {
        throw new Error(json.error ?? 'Exam deadline reached. Submission was not saved.');
      }
      const priorId = String(json.attemptId ?? json.priorAttempt?.id ?? '').trim();
      if (priorId) {
        return { attemptId: priorId, savedToServer: true, alreadyCompleted: true };
      }
      throw new Error(
        json.error ??
          'You have already submitted this exam. Each roll number may attempt it only once.',
      );
    }

    if (res.ok) {
      const json = (await res.json()) as {
        id?: string;
        attempt?: DashboardAttemptView;
        attempts?: DashboardAttemptView[];
        warning?: string;
      };
      const serverId = String(json.id ?? '').trim();
      if (!serverId || serverId.startsWith('pending-')) {
        throw new Error(
          json.warning ??
            'Your attempt could not be fully saved on the server. Please check your connection and try again.',
        );
      }
      savedToServer = true;
      attemptId = serverId;
      if (json.attempts?.length) {
        cacheApiAttempts(user.id, json.attempts);
      } else if (json.attempt) {
        cacheApiAttempts(user.id, [json.attempt]);
      }
      saveLocalTestAttempt(user.id, serverId, {
        attempt: {
          id: serverId,
          user_id: user.id,
          test_id: input.testId,
          started_at: nowIso,
          completed_at: nowIso,
          score: input.scorePercent,
          answers: null,
          time_taken: elapsedSec,
          status: 'completed' as const,
          created_at: nowIso,
        },
        test,
      });
      pushDashboardFeedEntry(
        user.id,
        buildFeedEntry({
          id: serverId,
          userId: user.id,
          testId: input.testId,
          testName: input.testName,
          scorePercent: input.scorePercent,
          elapsedSec,
          completedAtIso: nowIso,
        }),
      );
    } else if (res.status >= 500) {
      const syncRes = await fetchSubmitWithRetry(
        () =>
          fetchWithSession('/api/student/test-attempts/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              testId: input.testId,
              testName: input.testName,
              attemptId: input.attemptId,
              scorePercent: input.scorePercent,
              elapsedSec,
              totalQuestions: input.test?.total_questions,
            }),
          }),
        { attempts: 3, baseDelayMs: 800 },
      );
      if (syncRes.ok) {
        const syncJson = (await syncRes.json()) as {
          id?: string;
          attempt?: DashboardAttemptView;
          attempts?: DashboardAttemptView[];
        };
        const serverId = String(syncJson.id ?? '').trim();
        if (serverId && !serverId.startsWith('local-') && !serverId.startsWith('pending-')) {
          savedToServer = true;
          attemptId = serverId;
          if (syncJson.attempts?.length) {
            cacheApiAttempts(user.id, syncJson.attempts);
          } else if (syncJson.attempt) {
            cacheApiAttempts(user.id, [syncJson.attempt]);
          }
          saveLocalTestAttempt(user.id, serverId, {
            attempt: {
              id: serverId,
              user_id: user.id,
              test_id: input.testId,
              started_at: nowIso,
              completed_at: nowIso,
              score: input.scorePercent,
              answers: null,
              time_taken: elapsedSec,
              status: 'completed' as const,
              created_at: nowIso,
            },
            test,
          });
          pushDashboardFeedEntry(
            user.id,
            buildFeedEntry({
              id: serverId,
              userId: user.id,
              testId: input.testId,
              testName: input.testName,
              scorePercent: input.scorePercent,
              elapsedSec,
              completedAtIso: nowIso,
            }),
          );
          return { attemptId, savedToServer: true };
        }
      }
      saveLocalTestAttempt(user.id, attemptId, {
        attempt: {
          id: attemptId,
          user_id: user.id,
          test_id: input.testId,
          started_at: nowIso,
          completed_at: nowIso,
          score: input.scorePercent,
          answers: input.answers ?? null,
          time_taken: elapsedSec,
          status: 'completed' as const,
          created_at: nowIso,
        },
        test,
      });
      pushDashboardFeedEntry(
        user.id,
        buildFeedEntry({
          id: attemptId,
          userId: user.id,
          testId: input.testId,
          testName: input.testName,
          scorePercent: input.scorePercent,
          elapsedSec,
          completedAtIso: nowIso,
        }),
      );
      return { attemptId, savedToServer: false };
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      const message =
        json.error ?? `Submission was rejected (${res.status}).`;
      return { attemptId, savedToServer: false, error: message };
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Could not reach the server. Check your connection and try again.';
    return { attemptId, savedToServer: false, error: message };
  }

  return { attemptId, savedToServer };
}
