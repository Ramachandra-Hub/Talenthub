'use client';

import { useEffect, useRef } from 'react';
import type { TestAnswer } from '@/app/tests/take/[testId]/test-context';
import { saveExamDraft } from '@/lib/exam-v2/autosave';
import { EXAM_LOCAL_DRAFT_INTERVAL_MS } from '@/lib/exam-v2/progress-intervals';

type Options = {
  testId: string;
  attemptId?: string | null;
  enabled?: boolean;
  /** Local sessionStorage draft interval. Server saves use test-attempts/progress only. */
  localIntervalMs?: number;
  answers: Record<string, TestAnswer>;
  currentQuestionIndex: number;
  timeRemaining: number;
  isSubmitted: boolean;
};

/** Local draft only — in-progress state is persisted via /api/student/test-attempts/progress. */
export function useExamAutosave({
  testId,
  enabled = true,
  localIntervalMs = EXAM_LOCAL_DRAFT_INTERVAL_MS,
  answers,
  currentQuestionIndex,
  timeRemaining,
  isSubmitted,
}: Options) {
  const snapshotRef = useRef({ answers, currentQuestionIndex, timeRemaining });

  useEffect(() => {
    snapshotRef.current = { answers, currentQuestionIndex, timeRemaining };
  }, [answers, currentQuestionIndex, timeRemaining]);

  useEffect(() => {
    if (!enabled || isSubmitted) return;

    const saveLocal = () => {
      const s = snapshotRef.current;
      saveExamDraft({
        testId,
        answers: s.answers,
        currentQuestionIndex: s.currentQuestionIndex,
        timeRemaining: s.timeRemaining,
        savedAt: new Date().toISOString(),
      });
    };

    saveLocal();
    const localId = window.setInterval(saveLocal, localIntervalMs);

    return () => clearInterval(localId);
  }, [testId, enabled, localIntervalMs, isSubmitted]);
}
