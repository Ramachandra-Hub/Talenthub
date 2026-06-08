'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  PLACEMENT_EXAM_NAME,
  PLACEMENT_SECTIONS,
  PLACEMENT_TOTAL_MARKS,
  PLACEMENT_TOTAL_SEC,
  SPEAKING_TASKS,
  describeTechnicalSection,
  findDepartment,
} from '@/lib/placement/config';
import { computePlacementScorecard } from '@/lib/placement/scoring';
import { fetchElevateXAttemptStatus, getElevateXTestId } from '@/lib/placement/elevatex-attempt';
import { encodeElevateXScorecardAnswers } from '@/lib/placement/scorecard-payload';
import { ELEVATEX_SERVER_PROGRESS_INTERVAL_MS } from '@/lib/exam-v2/progress-intervals';
import {
  clearPlacementDrafts,
  clearPlacementProctorSessionId,
  consumePlacementSessionHandoff,
  getPlacementCompletedAttemptId,
  loadCandidateDraft,
  loadPlacementProctorSessionId,
  loadSession,
  deriveGlobalTimeLeftSec,
  markPlacementCompleted,
  saveScorecardForAttempt,
} from '@/lib/placement/session';
import { recordDashboardAttempt } from '@/lib/record-dashboard-attempt';
import { fetchWithSession } from '@/lib/client-auth';
import type {
  PlacementCodingSubmission,
  PlacementMcqAnswerMap,
  PlacementSectionId,
  PlacementSession,
  PlacementSpeakingResponse,
} from '@/lib/placement/types';
import SpeakingSection from '@/components/placement/speaking-section';
import { PlacementMcqRunner } from '@/components/placement/placement-mcq-runner';
import { PlacementTechnicalSection } from '@/components/placement/placement-technical-section';
import { ExamProctorPanel } from '@/components/proctor/exam-proctor-panel';
import { useExamProctoring } from '@/hooks/use-exam-proctoring';
import { getExamViolations, mergeExamViolations } from '@/lib/exam-v2/proctoring';
import type { ProctorSummary } from '@/lib/exam-v2/proctoring-config';

async function restorePlacementProctorViolations(sessionId: string, testId: string): Promise<void> {
  try {
    const res = await fetchWithSession(
      `/api/student/test-attempts/open?testId=${encodeURIComponent(testId)}`,
    );
    if (!res.ok) return;
    const json = (await res.json()) as {
      openAttempt?: { answers?: Record<string, unknown> } | null;
    };
    const proctor = json.openAttempt?.answers?.__proctor as
      | { violations?: Array<{ type: string; at: string }> }
      | undefined;
    if (proctor?.violations?.length) {
      mergeExamViolations(sessionId, proctor.violations);
    }
  } catch {
    /* sessionStorage violations still apply */
  }
}

function formatHms(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlacementTakePage() {
  const router = useRouter();
  const [session, setSession] = useState<PlacementSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [proctorReady, setProctorReady] = useState(false);
  const [proctorSessionId, setProctorSessionId] = useState('');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOnLoad, setSubmitOnLoad] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const submitGuardRef = useRef(false);
  const liveAttemptIdRef = useRef('');
  const progressInFlightRef = useRef(false);
  const proctorSessionIdRef = useRef('');
  const handleSubmitRef = useRef<(reason: 'manual' | 'timeout') => Promise<void>>(async () => {});
  const proctorVideoRef = useRef<HTMLVideoElement>(null);
  const proctorSummaryRef = useRef<ProctorSummary | null>(null);
  const sessionRef = useRef<PlacementSession | null>(null);

  const elevateXTestId = getElevateXTestId();
  const proctorActive = proctorReady && Boolean(proctorSessionId);

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
    testId: elevateXTestId,
    sessionId: proctorSessionId,
    enabled: proctorActive && Boolean(proctorSessionId),
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
      setShowSubmitConfirm(false);
      void handleSubmitRef.current('timeout');
    },
  });

  // Hydrate session and block repeat attempts.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const draft = loadCandidateDraft();
      const hallTicket = draft?.hallTicket ?? '';
      const status = await fetchElevateXAttemptStatus(hallTicket || undefined);
      if (cancelled) return;

      if (status.statusError) {
        setLoadError('Could not verify your ElevateX session. Check your connection and try again.');
        setHydrated(true);
        return;
      }

      const localCompletedId = hallTicket ? getPlacementCompletedAttemptId(hallTicket) : null;
      const completedAttemptId =
        status.completed && status.attemptId ? status.attemptId : localCompletedId;

      if (completedAttemptId) {
        clearPlacementDrafts(hallTicket || undefined);
        setBlocked(true);
        router.replace(`/placement/result/${completedAttemptId}`);
        return;
      }

      const loaded = loadSession();
      if (
        !loaded ||
        loaded.submitted ||
        (hallTicket && loaded.candidate.hallTicket !== hallTicket)
      ) {
        router.replace('/placement/assessment');
        return;
      }

      consumePlacementSessionHandoff();

      if (deriveGlobalTimeLeftSec(loaded) <= 0) {
        setSession(loaded);
        setHydrated(true);
        setSubmitOnLoad(true);
        const storedProctor = loadPlacementProctorSessionId();
        if (storedProctor) {
          await restorePlacementProctorViolations(storedProctor, elevateXTestId);
          setProctorSessionId(storedProctor);
          setProctorReady(true);
        }
        return;
      }

      setSession(loaded);
      setHydrated(true);
      const storedProctor = loadPlacementProctorSessionId();
      if (storedProctor) {
        await restorePlacementProctorViolations(storedProctor, elevateXTestId);
        setProctorSessionId(storedProctor);
        setProctorReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    proctorSessionIdRef.current = proctorSessionId;
  }, [proctorSessionId]);

  // Report in-progress attempt so admin live leaderboard shows students writing.
  useEffect(() => {
    if (!hydrated || !session || session.submitted) return;

    const reportProgress = async () => {
      if (progressInFlightRef.current) return;
      progressInFlightRef.current = true;
      try {
        const current = sessionRef.current;
        if (!current || current.submitted) return;

        const user = await (async () => {
          const { getClientUser } = await import('@/lib/client-auth');
          return getClientUser();
        })();
        if (!user?.id) return;

        let scorePercent = 0;
        try {
          scorePercent = computePlacementScorecard(current).percentage;
        } catch {
          scorePercent = 0;
        }

        const dept = findDepartment(current.candidate.departmentId);
        const elapsedSec = Math.max(
          0,
          PLACEMENT_TOTAL_SEC - deriveGlobalTimeLeftSec(current),
        );
        const activeProctorSession = proctorSessionIdRef.current;
        const violations = activeProctorSession ? getExamViolations(activeProctorSession) : [];
        const accessBranch = dept?.name ?? current.candidate.departmentId;
        const accessRollNumber = current.candidate.hallTicket;

        const res = await fetchWithSession('/api/student/test-attempts/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId: elevateXTestId,
            testName: `ElevateX · ${dept?.name ?? 'Department'}`,
            scorePercent,
            elapsedSec,
            startedAtIso: current.candidate.startedAt,
            attemptId: liveAttemptIdRef.current || undefined,
            accessBranch,
            accessYear: '',
            accessRollNumber,
            proctorSessionId: activeProctorSession || undefined,
            proctorViolationCount: violations.length,
            answers: {
              __placement: {
                globalTimeLeftSec: deriveGlobalTimeLeftSec(current),
                currentSectionIndex: current.currentSectionIndex,
                partialScorePercent: scorePercent,
              },
              __proctor: {
                sessionId: activeProctorSession,
                violationCount: violations.length,
                violations: violations.map((v) => ({ type: v.type, at: v.at })),
              },
            },
          }),
        });
        if (res.status === 409) {
          const json = (await res.json()) as { attemptId?: string };
          if (json.attemptId) {
            markPlacementCompleted(current.candidate.hallTicket, json.attemptId);
            setBlocked(true);
            router.replace(`/placement/result/${json.attemptId}`);
          }
          return;
        }
        if (!res.ok) return;

        const json = (await res.json()) as { id?: string; throttled?: boolean };
        if (json.throttled) return;
        if (json.id) liveAttemptIdRef.current = String(json.id);
      } catch {
        /* offline — local session still saved */
      } finally {
        progressInFlightRef.current = false;
      }
    };

    void reportProgress();
    const interval = window.setInterval(
      () => void reportProgress(),
      ELEVATEX_SERVER_PROGRESS_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [hydrated, session, elevateXTestId]);

  // Disable copy / paste on the take page.
  useEffect(() => {
    if (!hydrated) return;
    const block = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('copy', block);
    document.addEventListener('paste', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('paste', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
    };
  }, [hydrated]);

  const currentSection = useMemo(() => {
    if (!session) return null;
    return PLACEMENT_SECTIONS[session.currentSectionIndex] ?? null;
  }, [session]);

  const restoreSubmitAfterFailure = useCallback((message: string) => {
    submitGuardRef.current = false;
    setSubmitting(false);
    setSession((prev) => {
      if (!prev) return prev;
      const restored = { ...prev, submitted: false };
      sessionRef.current = restored;
      return restored;
    });
    setSubmitError(message);
  }, []);

  const handleSubmit = useCallback(
    async (reason: 'manual' | 'timeout') => {
      if (!session || submitGuardRef.current) return;
      submitGuardRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      sessionRef.current = { ...session, submitted: true };
      setSession((prev) => (prev ? { ...prev, submitted: true } : prev));

      try {
        const scorecard = computePlacementScorecard(session);
        const dept = findDepartment(scorecard.candidate.departmentId);
        const isProctorAuto =
          reason === 'timeout' && Boolean(proctorSummaryRef.current);
        const testName = `ElevateX · ${dept?.name ?? 'Department'}${
          isProctorAuto ? ' (auto-submit)' : reason === 'timeout' ? ' (time up)' : ''
        }`;

        const submitReason =
          reason === 'timeout' && proctorSummaryRef.current ? 'proctor_violations' : reason;
        const proctorSummary =
          proctorSummaryRef.current ??
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

        const elapsedForSubmit = Math.min(
          PLACEMENT_TOTAL_SEC,
          Math.max(0, PLACEMENT_TOTAL_SEC - deriveGlobalTimeLeftSec(session)),
        );

        const submitRes = await recordDashboardAttempt({
          testId: elevateXTestId,
          testName,
          attemptId: liveAttemptIdRef.current || undefined,
          scorePercent: scorecard.percentage,
          rawNetScore: scorecard.earnedMarks,
          elapsedSec: elapsedForSubmit,
          examKind: 'practice',
          accessBranch: dept?.name ?? scorecard.candidate.departmentId,
          accessYear: '',
          accessRollNumber: scorecard.candidate.hallTicket,
          answers: encodeElevateXScorecardAnswers(
            scorecard,
            proctorSummary ? { __proctor: proctorSummary as Record<string, unknown> } : undefined,
          ),
          proctorSessionId: proctorSummary?.sessionId,
          proctorViolations: proctorSummary?.violationCount ?? 0,
          proctorAutoSubmit: proctorSummary?.autoSubmitted ?? false,
          test: {
            id: elevateXTestId,
            name: testName,
            category_id: 'placement',
            duration: 60,
            total_questions: PLACEMENT_TOTAL_MARKS,
          },
        });

        if (submitRes?.alreadyCompleted && submitRes.attemptId) {
          markPlacementCompleted(scorecard.candidate.hallTicket, submitRes.attemptId);
          clearPlacementDrafts(scorecard.candidate.hallTicket);
          router.replace(`/placement/result/${submitRes.attemptId}`);
          return;
        }

        if (!submitRes?.attemptId) {
          restoreSubmitAfterFailure(
            submitRes?.error ??
              'Could not save your ElevateX attempt. Check your internet connection and try Submit again.',
          );
          return;
        }

        const attemptId = submitRes.attemptId;
        if (!submitRes.savedToServer) {
          saveScorecardForAttempt(attemptId, { ...scorecard, attemptId });
          markPlacementCompleted(scorecard.candidate.hallTicket, attemptId);
          clearPlacementDrafts(scorecard.candidate.hallTicket);
          clearPlacementProctorSessionId();
          setShowSubmitConfirm(false);
          router.replace(`/placement/result/${attemptId}?pending=1`);
          return;
        }
        saveScorecardForAttempt(attemptId, { ...scorecard, attemptId });
        markPlacementCompleted(scorecard.candidate.hallTicket, attemptId);
        clearPlacementDrafts(scorecard.candidate.hallTicket);
        clearPlacementProctorSessionId();
        void fetchWithSession('/api/auth/student/session-release', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => undefined);
        setShowSubmitConfirm(false);
        router.replace(`/placement/result/${attemptId}`);
      } catch (err) {
        restoreSubmitAfterFailure(
          err instanceof Error ? err.message : 'Submit failed. Please try again.',
        );
      }
    },
    [
      session,
      router,
      proctorActive,
      proctorSessionId,
      violationCount,
      elevateXTestId,
      restoreSubmitAfterFailure,
    ],
  );

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    if (!submitOnLoad || !session) return;
    void handleSubmit('timeout').catch(() => undefined);
    setSubmitOnLoad(false);
  }, [submitOnLoad, session, handleSubmit]);

  // Wall-clock timer — refresh does not reset to 60:00 (uses candidate.startedAt).
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => {
      setSession((prev) => {
        if (!prev || prev.submitted) return prev;
        const nextGlobal = deriveGlobalTimeLeftSec(prev);

        if (nextGlobal <= 0 && !submitGuardRef.current) {
          window.setTimeout(
            () => void handleSubmitRef.current('timeout').catch(() => undefined),
            0,
          );
        }

        return { ...prev, globalTimeLeftSec: nextGlobal };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  const switchSection = (newIndex: number) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (newIndex === prev.currentSectionIndex) return prev;
      if (!PLACEMENT_SECTIONS[newIndex]) return prev;
      return {
        ...prev,
        currentSectionIndex: newIndex,
      };
    });
  };

  const allSectionsComplete = (states: PlacementSession['sectionStates']) =>
    PLACEMENT_SECTIONS.every((s) => states[s.id as PlacementSectionId]?.completed);

  const handleMarkSectionDone = () => {
    let shouldPromptSubmit = false;
    setSession((prev) => {
      if (!prev) return prev;
      const cfg = PLACEMENT_SECTIONS[prev.currentSectionIndex];
      const state = prev.sectionStates[cfg.id as PlacementSectionId];
      if (!state) return prev;
      const updatedStates = {
        ...prev.sectionStates,
        [cfg.id]: { ...state, completed: true },
      };

      if (allSectionsComplete(updatedStates)) {
        shouldPromptSubmit = true;
        return { ...prev, sectionStates: updatedStates };
      }

      let nextIndex = prev.currentSectionIndex + 1;
      while (
        nextIndex < PLACEMENT_SECTIONS.length &&
        updatedStates[PLACEMENT_SECTIONS[nextIndex].id as PlacementSectionId]?.completed
      ) {
        nextIndex += 1;
      }

      if (nextIndex >= PLACEMENT_SECTIONS.length) {
        shouldPromptSubmit = true;
        return { ...prev, sectionStates: updatedStates };
      }

      return {
        ...prev,
        sectionStates: updatedStates,
        currentSectionIndex: nextIndex,
      };
    });
    if (shouldPromptSubmit) {
      setShowSubmitConfirm(true);
    }
  };

  const setMcqAnswer = (questionId: string, value: string | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      const cfg = PLACEMENT_SECTIONS[prev.currentSectionIndex];
      const state = prev.sectionStates[cfg.id as PlacementSectionId];
      if (state?.kind === 'mcq') {
        const nextAnswers = { ...state.answers };
        if (value === null) delete nextAnswers[questionId];
        else nextAnswers[questionId] = value;
        return {
          ...prev,
          sectionStates: {
            ...prev.sectionStates,
            [cfg.id]: { ...state, answers: nextAnswers },
          },
        };
      }
      if (state?.kind === 'technical' && state.mcq) {
        const nextAnswers = { ...state.mcq.answers };
        if (value === null) delete nextAnswers[questionId];
        else nextAnswers[questionId] = value;
        return {
          ...prev,
          sectionStates: {
            ...prev.sectionStates,
            [cfg.id]: { ...state, mcq: { ...state.mcq, answers: nextAnswers } },
          },
        };
      }
      return prev;
    });
  };

  const saveSpeakingResponse = (response: PlacementSpeakingResponse) => {
    setSession((prev) => {
      if (!prev) return prev;
      const cfg = PLACEMENT_SECTIONS[prev.currentSectionIndex];
      const state = prev.sectionStates[cfg.id as PlacementSectionId];
      if (!state || state.kind !== 'speaking') return prev;
      const others = state.responses.filter((r) => r.taskId !== response.taskId);
      return {
        ...prev,
        sectionStates: {
          ...prev.sectionStates,
          [cfg.id]: {
            ...state,
            responses: [...others, response],
          },
        },
      };
    });
  };

  const saveCodingSubmission = (submission: PlacementCodingSubmission) => {
    setSession((prev) => {
      if (!prev) return prev;
      const cfg = PLACEMENT_SECTIONS[prev.currentSectionIndex];
      const state = prev.sectionStates[cfg.id as PlacementSectionId];
      if (state?.kind === 'coding') {
        return {
          ...prev,
          sectionStates: {
            ...prev.sectionStates,
            [cfg.id]: {
              ...state,
              submissions: {
                ...state.submissions,
                [submission.problemId]: submission,
              },
            },
          },
        };
      }
      if (state?.kind === 'technical' && state.coding) {
        return {
          ...prev,
          sectionStates: {
            ...prev.sectionStates,
            [cfg.id]: {
              ...state,
              coding: {
                ...state.coding,
                submissions: {
                  ...state.coding.submissions,
                  [submission.problemId]: submission,
                },
              },
            },
          },
        };
      }
      return prev;
    });
  };

  const overallProgress = useMemo(() => {
    if (!session) return 0;
    let answered = 0;
    let total = 0;
    for (const cfg of PLACEMENT_SECTIONS) {
      const state = session.sectionStates[cfg.id as PlacementSectionId];
      if (cfg.kind === 'mcq' && state?.kind === 'mcq') {
        total += state.questions.length;
        answered += Object.values(state.answers).filter(Boolean).length;
      } else if (state?.kind === 'technical') {
        if (state.mcq) {
          total += state.mcq.questions.length;
          answered += Object.values(state.mcq.answers).filter(Boolean).length;
        }
        if (state.coding) {
          total += state.coding.problems.length;
          answered += Object.keys(state.coding.submissions).length;
        }
      } else if (cfg.kind === 'coding' && state?.kind === 'coding') {
        total += state.problems.length;
        answered += Object.keys(state.submissions).length;
      } else if (cfg.kind === 'speaking' && state?.kind === 'speaking') {
        total += SPEAKING_TASKS.length;
        answered += state.responses.length;
      }
    }
    return total > 0 ? Math.round((answered / total) * 100) : 0;
  }, [session]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-slate-700 text-center max-w-md">{loadError}</p>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/placement/assessment">Back to ElevateX start</Link>
          </Button>
          <Button asChild>
            <Link href="/exams">Examinations</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (blocked || !hydrated || !session || !currentSection) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-slate-600 text-center">
          {blocked ? 'Redirecting to your ElevateX result…' : 'Preparing your placement session…'}
        </p>
        {!blocked && !hydrated ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/placement/assessment">Return to start page</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (!proctorReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="max-w-lg w-full p-6 shadow-md border-slate-200 text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">{PLACEMENT_EXAM_NAME}</h1>
          <p className="text-sm text-slate-600 mb-4">
            Proctoring is enabled from the start page. Return there to grant camera access and start
            your exam.
          </p>
          <Button type="button" onClick={() => router.replace('/placement/assessment')}>
            Return to start page
          </Button>
        </Card>
      </div>
    );
  }

  const dept = findDepartment(session.candidate.departmentId);
  const sectionsDoneCount = PLACEMENT_SECTIONS.filter(
    (s) => session.sectionStates[s.id as PlacementSectionId]?.completed,
  ).length;
  const sectionState = session.sectionStates[currentSection.id as PlacementSectionId];

  return (
    <div className="min-h-screen bg-slate-50 select-none">
      <header className="sticky top-0 z-30 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-10 w-10 rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/30 items-center justify-center text-xl shrink-0">
              ✨
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 truncate">
                {session.candidate.collegeName ?? 'Campus assessment'}
              </p>
              <h1 className="text-lg sm:text-xl font-black tracking-tight bg-gradient-to-r from-white via-fuchsia-100 to-cyan-200 bg-clip-text text-transparent truncate">
                {PLACEMENT_EXAM_NAME}
              </h1>
            </div>
          </div>
          <div className="hidden sm:flex flex-col text-right text-xs ml-auto mr-3">
            <span className="opacity-70">{session.candidate.fullName}</span>
            <span className="opacity-70 font-mono">{session.candidate.hallTicket} · {dept?.name ?? 'Custom'}</span>
          </div>
          <div className="flex items-center gap-2 sm:ml-3">
            <div
              className={cn(
                'rounded-md px-3 py-1.5 text-center transition',
                session.globalTimeLeftSec <= 300
                  ? 'bg-red-500/90 animate-pulse'
                  : 'bg-white/10',
              )}
            >
              <p className="text-[10px] uppercase opacity-80 leading-none">Time left</p>
              <p className="font-mono text-lg font-bold tabular-nums leading-none mt-1">
                {formatHms(session.globalTimeLeftSec)}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="ml-2 bg-emerald-500 hover:bg-emerald-400 text-white"
            disabled={submitting}
            onClick={() => setShowSubmitConfirm(true)}
          >
            {submitting ? 'Submitting…' : 'Submit test'}
          </Button>
        </div>
        <div className="bg-white/10 h-1">
          <div
            className="bg-emerald-400 h-1 transition-all"
            style={{ width: `${overallProgress}%` }}
          />
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

      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Sections
          </p>
          {PLACEMENT_SECTIONS.map((s, i) => {
            const state = session.sectionStates[s.id as PlacementSectionId];
            const isCurrent = i === session.currentSectionIndex;
            const isDone = state?.completed;
            const counter =
              state?.kind === 'mcq'
                ? `${Object.values(state.answers).filter(Boolean).length}/${state.questions.length}`
                : state?.kind === 'technical'
                  ? [
                      state.mcq
                        ? `MCQ ${Object.values(state.mcq.answers).filter(Boolean).length}/${state.mcq.questions.length}`
                        : '',
                      state.coding
                        ? `Code ${Object.keys(state.coding.submissions).length}/${state.coding.problems.length}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                : state?.kind === 'coding'
                  ? `${Object.keys(state.submissions).length}/${state.problems.length}`
                : state?.kind === 'speaking'
                  ? `${state.responses.length}/${SPEAKING_TASKS.length}`
                  : '';
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => switchSection(i)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border-2 transition flex items-start gap-3',
                  isCurrent
                    ? 'border-[#1e3a5f] bg-white shadow-sm'
                    : 'border-slate-200 bg-white/60 hover:border-slate-300',
                )}
              >
                <span className="text-xl shrink-0" aria-hidden>
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {i + 1}. {s.short}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{s.marks} marks</p>
                  <p className="text-[11px] text-slate-700 mt-1 font-mono">{counter}</p>
                </div>
                {isDone ? (
                  <span className="text-emerald-600 text-xs font-bold">✓</span>
                ) : null}
              </button>
            );
          })}
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Move between sections freely. Only the overall {Math.round(PLACEMENT_TOTAL_SEC / 60)}-minute exam timer
            applies; submit before it reaches zero.
          </p>
        </aside>

        <section className="lg:col-span-3 space-y-4">
          <Card className="p-4 border-slate-200 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Section {session.currentSectionIndex + 1} of {PLACEMENT_SECTIONS.length}
                </p>
                <h2 className="text-xl font-bold text-slate-900 mt-1">{currentSection.name}</h2>
                <p className="text-sm text-slate-600 mt-1">
                  {currentSection.id === 'technical'
                    ? describeTechnicalSection(
                        session.candidate.technicalFormat,
                        dept?.name ?? session.candidate.departmentId,
                      )
                    : currentSection.description}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold text-[#1e3a5f]">{currentSection.marks}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wide">marks</p>
              </div>
            </div>
          </Card>

          {sectionState?.kind === 'technical' ? (
            <PlacementTechnicalSection
              format={sectionState.format}
              mcq={sectionState.mcq}
              coding={sectionState.coding}
              onMcqAnswerChange={setMcqAnswer}
              onCodingSubmissionChange={saveCodingSubmission}
            />
          ) : sectionState?.kind === 'mcq' ? (
            <PlacementMcqRunner
              key={currentSection.id}
              sectionId={currentSection.id}
              questions={sectionState.questions}
              answers={sectionState.answers}
              onAnswerChange={setMcqAnswer}
            />
          ) : sectionState?.kind === 'coding' ? (
            <PlacementTechnicalSection
              format="coding"
              coding={{
                problems: sectionState.problems,
                submissions: sectionState.submissions,
              }}
              onMcqAnswerChange={setMcqAnswer}
              onCodingSubmissionChange={saveCodingSubmission}
            />
          ) : sectionState?.kind === 'speaking' ? (
            <SpeakingSection
              responses={sectionState.responses}
              onSaveResponse={saveSpeakingResponse}
              onAllDone={handleMarkSectionDone}
            />
          ) : (
            <Card className="p-6 text-center text-slate-600">
              This section is not ready yet.
            </Card>
          )}

          <Card className="p-4 border-slate-200 shadow-sm flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => switchSection(session.currentSectionIndex - 1)}
              disabled={session.currentSectionIndex === 0}
            >
              ← Previous section
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleMarkSectionDone}>
                {session.currentSectionIndex >= PLACEMENT_SECTIONS.length - 1
                  ? 'Mark as done'
                  : 'Save & next section →'}
              </Button>
              <Button
                className="bg-[#1e3a5f] hover:bg-[#16304f] text-white"
                onClick={() => switchSection(session.currentSectionIndex + 1)}
                disabled={session.currentSectionIndex >= PLACEMENT_SECTIONS.length - 1}
              >
                Skip to next →
              </Button>
            </div>
          </Card>

          <p className="text-[11px] text-slate-500 text-center">
            Do not leave or refresh this page — your attempt cannot be resumed. Submit when you are
            finished.
          </p>
        </section>
      </main>

      {showSubmitConfirm ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white border-slate-200 shadow-xl">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Submit ElevateX test?</h2>
              <div className="space-y-2 mb-6 text-sm text-gray-600">
                <p>
                  Sections completed:{' '}
                  <span className="font-semibold text-gray-900">
                    {sectionsDoneCount}/{PLACEMENT_SECTIONS.length}
                  </span>
                </p>
                <p>Once submitted, you cannot change your answers. Your scorecard will be shown immediately.</p>
                {submitError ? (
                  <p className="text-red-700 font-medium rounded-md bg-red-50 border border-red-200 px-3 py-2">
                    {submitError}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => setShowSubmitConfirm(false)}
                >
                  Continue test
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={submitting}
                  onClick={() => void handleSubmit('manual')}
                >
                  {submitting ? 'Submitting…' : 'Submit test'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
