'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Test, Question } from '@/lib/types';
import { PRACTICE_PREVIEW_QUESTION_LIMIT } from '@/lib/constants';
import { useTest } from './test-context';
import QuestionDisplay from './question-display';
import QuestionNavigation from './question-navigation';
import TestTimer from './test-timer';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getClientUser } from '@/lib/client-auth';
import { isCodingQuestion } from '@/lib/practice-mappers';
import { formatScorePercentLabel, roundScorePercent } from '@/lib/format-score';
import { isSchemaMissingError } from '@/lib/fallback-question-bank';
import { useExamAutosave } from '@/hooks/use-exam-autosave';
import { useExamProctoring } from '@/hooks/use-exam-proctoring';
import { ExamProctorPanel } from '@/components/proctor/exam-proctor-panel';
import type { ProctorSubmitReason, ProctorSummary } from '@/lib/exam-v2/proctoring-config';
import { getExamViolations } from '@/lib/exam-v2/proctoring';
import { useSectionExam } from '@/hooks/use-section-exam';
import { clearExamDraft } from '@/lib/exam-v2/autosave';
import { assignQuestionsToSections } from '@/lib/exam-v2/load-sections';
import { scoreBySections, scoreMcqWithNegativeMarking } from '@/lib/exam-v2/scoring';
import { computeSectionProgress, type TestSectionConfig } from '@/lib/exam-v2/section-timer';
import {
  LOCAL_ATTEMPT_GUEST_USER_ID,
  removeLocalTestAttempt,
  saveLocalTestAttempt,
} from '@/lib/local-test-attempts';
import {
  cacheApiAttempts,
  isAttemptPersistenceError,
  type DashboardAttemptView,
} from '@/lib/test-attempts';
import {
  buildFeedEntry,
  pushDashboardFeedEntry,
  removeDashboardFeedEntry,
} from '@/lib/dashboard-feed';
import {
  dashboardDisplayNameForTest,
  isDepartmentExamTest,
} from '@/lib/programming-dashboard';

interface TestInterfaceProps {
  test: Test;
  questions: Question[];
  /** When false, only the first {@link PRACTICE_PREVIEW_QUESTION_LIMIT} questions are usable until the user signs in. */
  fullAccess: boolean;
  examSections?: TestSectionConfig[];
  proctorEnabled?: boolean;
  proctorSessionId?: string;
}

export default function TestInterface({
  test,
  questions,
  fullAccess,
  examSections = [],
  proctorEnabled = false,
  proctorSessionId = '',
}: TestInterfaceProps) {
  const router = useRouter();
  const pathname = usePathname();

  const loginHref = useMemo(
    () => `/auth/login?redirect=${encodeURIComponent(pathname || '/')}`,
    [pathname]
  );
  const {
    currentQuestionIndex,
    setCurrentQuestionIndex,
    answers,
    timeRemaining,
    setTimeRemaining,
    isSubmitted,
    setIsSubmitted,
  } = useTest();

  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const speedSecRaw = test.question_time_limit_sec;
  const speedActive =
    typeof speedSecRaw === 'number' && speedSecRaw > 0 ? true : false;
  const speedSec = speedActive ? Math.floor(Number(speedSecRaw)) : 0;
  const [questionTimeLeft, setQuestionTimeLeft] = useState(-1);

  const submitRef = useRef<(options?: SubmitOptions) => Promise<void>>(async () => {});
  const prevTimeRemainingRef = useRef<number | null>(null);
  const liveAttemptIdRef = useRef<string | null>(null);
  const proctorVideoRef = useRef<HTMLVideoElement>(null);
  const proctorSummaryRef = useRef<ProctorSummary | null>(null);

  type SubmitOptions = {
    submitReason?: ProctorSubmitReason;
    proctorSummary?: ProctorSummary;
  };

  const proctorActive = fullAccess && proctorEnabled && Boolean(proctorSessionId);

  const {
    violationCount,
    tabSwitchCount,
    cameraReady,
    cameraError,
    faceNotVisible,
    autoSubmitTriggered,
    startCamera,
    enterFullscreen,
    maxViolations,
  } = useExamProctoring({
    testId: test.id,
    sessionId: proctorSessionId || test.id,
    enabled: proctorActive,
    requireCamera: true,
    videoRef: proctorVideoRef,
    attemptIdRef: liveAttemptIdRef,
    onMaxViolations: ({ violationCount: count }) => {
      proctorSummaryRef.current = {
        sessionId: proctorSessionId,
        violationCount: count,
        autoSubmitted: true,
        submitReason: 'proctor_violations',
        violations: getExamViolations(proctorSessionId).map((v) => ({
          type: v.type,
          at: v.at,
        })),
      };
      void submitRef.current({
        submitReason: 'proctor_violations',
        proctorSummary: proctorSummaryRef.current,
      });
    },
  });

  useExamAutosave({
    testId: test.id,
    attemptId: liveAttemptIdRef.current,
    enabled: fullAccess,
    answers,
    currentQuestionIndex,
    timeRemaining,
    isSubmitted,
  });

  const sectionMode = examSections.length > 0 && fullAccess;
  const questionsBySection = useMemo(
    () => assignQuestionsToSections(questions, examSections),
    [questions, examSections],
  );

  useEffect(() => {
    if (!fullAccess || isSubmitted || test.id.startsWith('fallback-')) return;

    const timer = setTimeout(() => {
      void (async () => {
        const user = await getClientUser();
        if (!user) return;

        let scorePercent = 0;
        if (sectionMode && examSections.length) {
          scorePercent = roundScorePercent(
            scoreBySections(examSections, questionsBySection, answers).overallPercent,
          );
        } else {
          const { netScore, maxScore } = scoreMcqWithNegativeMarking(questions, answers, 0);
          scorePercent =
            maxScore > 0 ? roundScorePercent((netScore / maxScore) * 100) : 0;
        }

        const res = await fetchWithAuth('/api/student/test-attempts/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId: test.id,
            testName: dashboardDisplayNameForTest(test),
            scorePercent,
            answers,
            elapsedSec: Math.max(0, test.duration * 60 - timeRemaining),
            attemptId: liveAttemptIdRef.current,
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as { id?: string };
          if (json.id) liveAttemptIdRef.current = String(json.id);
        }
      })();
    }, 700);

    return () => clearTimeout(timer);
  }, [
    answers,
    timeRemaining,
    isSubmitted,
    fullAccess,
    test,
    sectionMode,
    examSections,
    questions,
    questionsBySection,
  ]);

  const submitRefEarly = useRef<() => Promise<void>>(async () => {});

  const { sectionIndex, currentSection, sectionTimeLeft } = useSectionExam({
    sections: examSections,
    enabled: sectionMode && !isSubmitted,
    onSectionTimeout: () => setCurrentQuestionIndex(0),
    onAllSectionsComplete: () => void submitRefEarly.current(),
  });

  const activeSectionQuestions = useMemo(() => {
    if (!sectionMode || !currentSection) return questions;
    return questionsBySection.get(currentSection.id) ?? questions;
  }, [sectionMode, currentSection, questionsBySection, questions]);

  // Overall test countdown (minutes → seconds in context) — skip when section timers active
  useEffect(() => {
    if (sectionMode) return;
    const key = `exam:start:${test.id}`;
    const nowMs = Date.now();
    let startMs = Number(window.sessionStorage.getItem(key) ?? '');
    if (!Number.isFinite(startMs) || startMs <= 0) {
      startMs = nowMs;
      window.sessionStorage.setItem(key, String(startMs));
    }
    setStartedAtMs(startMs);
    const durationSec = Math.max(0, Math.floor(test.duration * 60));
    const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    setTimeRemaining(Math.max(0, durationSec - elapsedSec));
  }, [test.duration, setTimeRemaining, sectionMode]);

  // Auto-submit when the overall test timer reaches zero (once per attempt).
  useEffect(() => {
    if (isSubmitted || submitting) return;
    const t = timeRemaining;
    const prev = prevTimeRemainingRef.current;
    prevTimeRemainingRef.current = t;
    if (prev === null) return;
    if (prev > 0 && t === 0) {
      void submitRef.current({ submitReason: 'timeout' });
    }
  }, [timeRemaining, isSubmitted, submitting]);

  // Per-question speed clock (psychometric rapid items)
  useEffect(() => {
    if (!speedActive || !speedSec) return;

    let timeoutId = 0;
    let cancelled = false;
    const end = Date.now() + speedSec * 1000;

    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setQuestionTimeLeft(left);
      if (cancelled || left <= 0) return;
      timeoutId = window.setTimeout(tick, 1000);
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [speedActive, speedSec, currentQuestionIndex]);

  const unlockedCount = useMemo(
    () =>
      fullAccess
        ? activeSectionQuestions.length
        : Math.min(PRACTICE_PREVIEW_QUESTION_LIMIT, activeSectionQuestions.length),
    [fullAccess, activeSectionQuestions.length]
  );

  useEffect(() => {
    if (fullAccess) return;
    const maxAllowed = Math.max(0, unlockedCount - 1);
    setCurrentQuestionIndex(Math.min(currentQuestionIndex, maxAllowed));
  }, [fullAccess, unlockedCount, currentQuestionIndex, setCurrentQuestionIndex]);

  const currentQuestion = activeSectionQuestions[currentQuestionIndex];
  const isCodingItem = currentQuestion ? isCodingQuestion(currentQuestion) : false;

  const scopeQuestions = fullAccess ? activeSectionQuestions : activeSectionQuestions.slice(0, unlockedCount);
  const answeredCount = scopeQuestions.filter(
    (q) => answers[q.id]?.userAnswer !== null && answers[q.id]?.userAnswer !== undefined
  ).length;
  const markedCount = scopeQuestions.filter((q) => answers[q.id]?.isMarkedForReview).length;
  const unattendedCount = scopeQuestions.length - answeredCount;

  const isPreviewMode = !fullAccess && activeSectionQuestions.length > unlockedCount;

  const sectionProgress = useMemo(() => {
    if (!sectionMode) return null;
    return computeSectionProgress(examSections, sectionIndex, sectionTimeLeft);
  }, [sectionMode, examSections, sectionIndex, sectionTimeLeft]);

  const saveLocalAttemptAndNavigate = (scorePercent: number, ownerUserId: string) => {
    const localAttemptId = `local-${Date.now()}`;
    saveLocalTestAttempt(ownerUserId, localAttemptId, {
      attempt: {
        id: localAttemptId,
        user_id: ownerUserId,
        test_id: test.id,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        score: scorePercent,
        answers,
        time_taken: test.duration * 60 - timeRemaining,
        status: 'completed',
        created_at: new Date().toISOString(),
      },
      test,
      questions,
      answers,
    });
    clearExamDraft(test.id);
    setIsSubmitted(true);
    router.push(`/tests/result/${localAttemptId}`);
  };

  async function handleSubmitTest(options?: SubmitOptions) {
    if (!currentQuestion || submitting || isSubmitted) return;

    setSubmitting(true);
    try {
      const submitReason = options?.submitReason ?? 'manual';
      const proctorSummary =
        options?.proctorSummary ??
        (proctorActive
          ? {
              sessionId: proctorSessionId,
              violationCount,
              autoSubmitted: submitReason === 'proctor_violations',
              submitReason,
              violations: getExamViolations(proctorSessionId).map((v) => ({
                type: v.type,
                at: v.at,
              })),
            }
          : undefined);
      let scorePercent = 0;
      let rawNetScore = 0;
      if (sectionMode && examSections.length) {
        const result = scoreBySections(examSections, questionsBySection, answers);
        scorePercent = roundScorePercent(result.overallPercent);
        rawNetScore = result.totalNet;
        if (result.sections.some((s) => !s.passedCutoff)) {
          console.info('Section cutoff missed:', result.sections.filter((s) => !s.passedCutoff));
        }
      } else {
        const { netScore, maxScore } = scoreMcqWithNegativeMarking(questions, answers, 0);
        rawNetScore = netScore;
        scorePercent = maxScore > 0 ? roundScorePercent((netScore / maxScore) * 100) : 0;
      }

      const user = await getClientUser();

      if (!user) {
        if (test.id.startsWith('fallback-')) {
          saveLocalAttemptAndNavigate(scorePercent, LOCAL_ATTEMPT_GUEST_USER_ID);
        } else {
          router.push(loginHref);
        }
        return;
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const elapsedSec =
        startedAtMs && startedAtMs > 0
          ? Math.max(0, Math.floor((now - startedAtMs) / 1000))
          : test.duration * 60 - timeRemaining;
      const startedAtIso =
        startedAtMs && startedAtMs > 0 ? new Date(startedAtMs).toISOString() : nowIso;
      const localAttemptId = `local-${Date.now()}`;
      const dashboardTestName = dashboardDisplayNameForTest(test);
      const examKind = isDepartmentExamTest(test)
        ? 'department'
        : test.id.startsWith('fallback-competitive')
          ? 'competitive'
          : 'practice';

      const answersPayload = proctorSummary
        ? {
            ...answers,
            __proctor: proctorSummary,
          }
        : answers;

      const localPayload = {
        attempt: {
          id: localAttemptId,
          user_id: user.id,
          test_id: test.id,
          started_at: startedAtIso,
          completed_at: nowIso,
          score: scorePercent,
          answers: answersPayload,
          time_taken: elapsedSec,
          status: 'completed' as const,
          created_at: nowIso,
        },
        test,
        questions,
        answers: answersPayload,
      };

      saveLocalTestAttempt(user.id, localAttemptId, localPayload);

      const writeFeed = (id: string) => {
        pushDashboardFeedEntry(
          user.id,
          buildFeedEntry({
            id,
            userId: user.id,
            testId: test.id,
            testName: dashboardTestName,
            scorePercent,
            elapsedSec,
            completedAtIso: nowIso,
            totalQuestions: questions.length,
          }),
        );
      };

      writeFeed(localAttemptId);

      let attemptId = localAttemptId;

      try {
        const apiRes = await fetchWithAuth('/api/student/test-attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId: test.id,
            testName: dashboardTestName,
            scorePercent,
            rawNetScore,
            elapsedSec,
            startedAtIso,
            completedAtIso: nowIso,
            attemptId: liveAttemptIdRef.current,
            examKind,
            totalQuestions: questions.length,
            answers: answersPayload,
            proctorSessionId: proctorSummary?.sessionId,
            proctorViolations: proctorSummary?.violationCount ?? 0,
            proctorAutoSubmit: proctorSummary?.autoSubmitted ?? false,
            submitReason,
          }),
        });
        if (apiRes.status === 409) {
          const json = (await apiRes.json().catch(() => ({}))) as {
            error?: string;
            attemptId?: string;
          };
          alert(json.error ?? 'You have already submitted this test.');
          if (json.attemptId) {
            router.replace(`/tests/result/${json.attemptId}`);
          }
          return;
        }
        if (apiRes.ok) {
          const json = (await apiRes.json()) as {
            id?: string;
            attempt?: DashboardAttemptView;
            attempts?: DashboardAttemptView[];
          };
          if (json.id) attemptId = String(json.id);
          if (json.attempt?.id) {
            writeFeed(String(json.attempt.id));
          } else if (json.id) {
            writeFeed(String(json.id));
          }
          if (json.attempts?.length) {
            cacheApiAttempts(user.id, json.attempts);
          } else if (json.attempt) {
            cacheApiAttempts(user.id, [json.attempt]);
          }
        }
      } catch {
        // API unavailable — keep local attempt id
      }

      if (attemptId !== localAttemptId) {
        saveLocalTestAttempt(user.id, attemptId, {
          ...localPayload,
          attempt: { ...localPayload.attempt, id: attemptId },
        });
        writeFeed(attemptId);
        // Avoid duplicate dashboard rows: drop the local placeholder now that
        // the server attempt id is canonical.
        removeLocalTestAttempt(user.id, localAttemptId);
        removeDashboardFeedEntry(user.id, localAttemptId);
      }

      if (!attemptId.startsWith('local-') && proctorSummary?.sessionId) {
        void fetchWithAuth('/api/v2/proctor/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId: test.id,
            sessionId: proctorSummary.sessionId,
            attemptId,
            linkAttempt: true,
            batch: proctorSummary.violations.map((v) => ({
              type: v.type,
              metadata: { at: v.at },
            })),
          }),
          keepalive: true,
        });
      }

      clearExamDraft(test.id);
      window.sessionStorage.removeItem(`exam:start:${test.id}`);
      setIsSubmitted(true);
      router.push(`/tests/result/${attemptId}`);
    } catch (error) {
      if (
        isSchemaMissingError(error) ||
        isAttemptPersistenceError(error) ||
        test.id.startsWith('fallback-')
      ) {
        let fallbackPercent = 0;
        if (sectionMode && examSections.length) {
          fallbackPercent = scoreBySections(examSections, questionsBySection, answers).overallPercent;
        } else {
          const { netScore, maxScore } = scoreMcqWithNegativeMarking(questions, answers, 0);
          fallbackPercent = maxScore > 0 ? roundScorePercent((netScore / maxScore) * 100) : 0;
        }
        let ownerId = LOCAL_ATTEMPT_GUEST_USER_ID;
        const fallbackUser = await getClientUser();
        if (fallbackUser?.id) ownerId = fallbackUser.id;
        saveLocalAttemptAndNavigate(fallbackPercent, ownerId);
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error submitting test:', message, error);
      alert(`Failed to submit test. ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  submitRef.current = handleSubmitTest;
  submitRefEarly.current = handleSubmitTest;

  useEffect(() => {
    if (!speedActive || questionTimeLeft !== 0) return;
    const run = window.setTimeout(() => {
      if (!fullAccess && currentQuestionIndex >= unlockedCount - 1) {
        router.push(loginHref);
        return;
      }
      if (fullAccess && currentQuestionIndex >= activeSectionQuestions.length - 1) {
        void submitRef.current();
      } else {
        const cap = fullAccess ? activeSectionQuestions.length - 1 : unlockedCount - 1;
        setCurrentQuestionIndex(Math.min(currentQuestionIndex + 1, cap));
      }
    }, 0);
    return () => clearTimeout(run);
  }, [
    questionTimeLeft,
    speedActive,
    currentQuestionIndex,
    activeSectionQuestions.length,
    setCurrentQuestionIndex,
    fullAccess,
    unlockedCount,
    router,
    loginHref,
  ]);

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-600">Loading question...</p>
      </div>
    );
  }

  return (
    <div className="exam-mode min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{test.name}</h1>
            {isPreviewMode ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-800">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Preview: {unlockedCount} of {questions.length} questions —{' '}
                <Link href={loginHref} className="font-medium underline underline-offset-2 hover:text-amber-950">
                  Sign in to unlock all
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-6">
            {speedActive && questionTimeLeft >= 0 ? (
              <div
                className={`text-base font-bold tabular-nums ${
                  questionTimeLeft <= 3 ? 'text-red-600' : 'text-amber-700'
                }`}
                title={`About ${speedSec}s per visual item`}
              >
                Question: {questionTimeLeft}s
              </div>
            ) : null}
            {sectionMode && currentSection ? (
              <div className="text-right">
                <p className="text-xs text-gray-600">
                  Section {sectionIndex + 1}/{examSections.length}: {currentSection.name}
                  {currentSection.negativeMarking ? ` · −${currentSection.negativeMarking} wrong` : ''}
                </p>
                <p
                  className={`text-lg font-bold tabular-nums ${
                    sectionTimeLeft <= 60 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {Math.floor(sectionTimeLeft / 60)}:{String(sectionTimeLeft % 60).padStart(2, '0')}
                </p>
                {currentSection.cutoffScore != null ? (
                  <p className="text-xs text-gray-500">
                    Section cutoff: {formatScorePercentLabel(currentSection.cutoffScore)}
                  </p>
                ) : null}
              </div>
            ) : (
              <TestTimer duration={test.duration} warnBelowSec={speedActive ? 90 : 300} />
            )}
          </div>
        </div>
      </header>

      {proctorActive ? (
        <ExamProctorPanel
          videoRef={proctorVideoRef}
          violationCount={violationCount}
          maxViolations={maxViolations}
          tabSwitchCount={tabSwitchCount}
          cameraReady={cameraReady}
          cameraError={cameraError}
          faceNotVisible={faceNotVisible}
          autoSubmitTriggered={autoSubmitTriggered}
          onEnterFullscreen={() => void enterFullscreen()}
          onVideoMount={() => void startCamera()}
        />
      ) : null}

      <div
        className={`flex-1 max-w-7xl mx-auto w-full gap-4 p-4 pb-8 ${
          isCodingItem ? 'flex flex-col' : 'grid md:grid-cols-4'
        }`}
      >
        {/* Question Display — full width when coding editor is active */}
        <div className={isCodingItem ? 'w-full min-w-0' : 'md:col-span-3'}>
          <Card
            className={`mb-4 bg-white border-gray-200 text-gray-900 shadow-sm backdrop-blur-none ${
              isCodingItem ? 'p-4 sm:p-5' : 'p-6'
            }`}
          >
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Question {currentQuestionIndex + 1} of{' '}
                  {isPreviewMode ? (
                    <>
                      {unlockedCount} <span className="text-gray-500">(preview of {questions.length})</span>
                    </>
                  ) : (
                    scopeQuestions.length
                  )}
                </span>
                <span className="px-3 py-1 bg-blue-100 text-[#0c2340] text-xs font-semibold rounded">
                  {speedActive ? 'Speed / visual' : 'Question'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-[#1e3a5f] h-2.5 rounded-full transition-all"
                  style={{
                    width: `${((currentQuestionIndex + 1) / (isPreviewMode ? unlockedCount : scopeQuestions.length)) * 100}%`,
                  }}
                />
              </div>
            </div>

            <QuestionDisplay question={currentQuestion} speedMode={speedActive} />
          </Card>

          {/* Navigation Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
              disabled={currentQuestionIndex === 0}
              className="flex-1"
            >
              ← Previous
            </Button>
            <Button
              onClick={() => {
                if (isPreviewMode && currentQuestionIndex >= unlockedCount - 1) {
                  router.push(loginHref);
                  return;
                }
                const cap = fullAccess ? activeSectionQuestions.length - 1 : unlockedCount - 1;
                setCurrentQuestionIndex(Math.min(cap, currentQuestionIndex + 1));
              }}
              disabled={fullAccess ? currentQuestionIndex >= activeSectionQuestions.length - 1 : false}
              className="flex-1"
            >
              {isPreviewMode && currentQuestionIndex >= unlockedCount - 1
                ? 'Sign in for more →'
                : 'Next →'}
            </Button>
            <Button
              onClick={() => {
                if (isPreviewMode) {
                  router.push(loginHref);
                  return;
                }
                setShowSubmitConfirm(true);
              }}
              variant="outline"
              className="px-6"
            >
              {isPreviewMode ? 'Unlock full test' : 'Submit Test'}
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <div className={isCodingItem ? 'w-full lg:w-72 shrink-0 lg:ml-auto' : 'md:col-span-1'}>
          <Card className="p-4 md:sticky md:top-24 bg-white border-gray-200 text-gray-900 shadow-sm backdrop-blur-none">
            <h3 className="font-semibold text-gray-900 mb-4">Test Status</h3>

            {sectionMode && sectionProgress ? (
              <div className="mb-4">
                <p className="text-xs text-gray-600 mb-1">{sectionProgress.label} · overall progress</p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#1e3a5f] h-2 rounded-full transition-all"
                    style={{ width: `${sectionProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-green-700">✓ Answered</span>
                <span className="font-semibold text-gray-900">{answeredCount}</span>
              </div>
              {speedActive ? (
                <div className="flex justify-between">
                  <span className="text-gray-600">Unanswered</span>
                  <span className="font-semibold text-gray-900">{unattendedCount}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-yellow-700">⚑ Review</span>
                    <span className="font-semibold text-gray-900">{markedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">○ Not Visited</span>
                    <span className="font-semibold text-gray-900">{unattendedCount}</span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <QuestionNavigation
                questions={questions}
                currentIndex={currentQuestionIndex}
                answers={answers}
                unlockedCount={unlockedCount}
                loginHref={loginHref}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white border-gray-200 text-gray-900 shadow-xl backdrop-blur-none">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Submit Test?</h2>
              <div className="space-y-2 mb-6 text-sm text-gray-600">
                <p>
                  Questions Answered:{' '}
                  <span className="font-semibold text-gray-900">
                    {answeredCount}/{questions.length}
                  </span>
                </p>
                <p>Once submitted, you cannot change your answers.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowSubmitConfirm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Continue Test
                </Button>
                <Button
                  onClick={() => void handleSubmitTest()}
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? 'Submitting...' : 'Submit Test'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
