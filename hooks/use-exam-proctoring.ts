'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PROCTOR_AUTO_SUBMIT_VIOLATION_TYPES,
  PROCTOR_FOCUS_DEBOUNCE_MS,
  PROCTOR_INGEST_FLUSH_MS,
  PROCTOR_MAX_VIOLATIONS,
} from '@/lib/exam-v2/proctoring-config';
import {
  countCountableExamViolations,
  logExamViolation,
  getExamViolations,
  type ExamViolationEvent,
  type ExamViolationType,
} from '@/lib/exam-v2/proctoring';
import { useCameraProctoring } from '@/hooks/use-camera-proctoring';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

type Options = {
  testId: string;
  sessionId: string;
  enabled?: boolean;
  requireCamera?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  attemptIdRef?: React.RefObject<string | null | undefined>;
  onMaxViolations?: (summary: { violationCount: number; violations: ExamViolationEvent[] }) => void;
};

const COUNTABLE_VIOLATIONS = new Set<ExamViolationType>(
  PROCTOR_AUTO_SUBMIT_VIOLATION_TYPES as unknown as ExamViolationType[],
);

export function useExamProctoring({
  testId,
  sessionId,
  enabled = true,
  requireCamera = true,
  videoRef,
  attemptIdRef,
  onMaxViolations,
}: Options) {
  const [violations, setViolations] = useState<ExamViolationEvent[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [autoSubmitTriggered, setAutoSubmitTriggered] = useState(false);

  const ingestQueueRef = useRef<Array<{ type: string; metadata?: Record<string, unknown> }>>([]);
  const flushTimerRef = useRef<number | null>(null);
  const lastFocusViolationRef = useRef(0);
  const autoSubmitRef = useRef(false);
  const maxViolationsRef = useRef(onMaxViolations);
  maxViolationsRef.current = onMaxViolations;

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const stored = getExamViolations(sessionId);
    const { violationCount: restoredCount, tabSwitchCount: restoredTabs } =
      countCountableExamViolations(stored);

    setViolations(stored);
    setViolationCount(restoredCount);
    setTabSwitchCount(restoredTabs);

    if (restoredCount >= PROCTOR_MAX_VIOLATIONS) {
      autoSubmitRef.current = true;
      setAutoSubmitTriggered(true);
    }
  }, [enabled, sessionId]);

  const flushIngest = useCallback(async () => {
    const batch = ingestQueueRef.current.splice(0, ingestQueueRef.current.length);
    if (!batch.length) return;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetchWithAuth('/api/v2/proctor/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId,
            sessionId,
            attemptId: attemptIdRef?.current || undefined,
            batch,
          }),
          keepalive: true,
        });
        if (res.ok) return;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }, [testId, sessionId, attemptIdRef]);

  const scheduleIngest = useCallback(
    (type: string, metadata?: Record<string, unknown>) => {
      ingestQueueRef.current.push({
        type,
        metadata: { ...(metadata ?? {}), sessionId },
      });
      if (flushTimerRef.current != null) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void flushIngest();
      }, PROCTOR_INGEST_FLUSH_MS);
    },
    [flushIngest],
  );

  const recordViolation = useCallback(
    (type: ExamViolationType, metadata?: Record<string, unknown>, options?: { countable?: boolean }) => {
      if (!enabled || autoSubmitRef.current) return;

      const event = logExamViolation(sessionId, { type, metadata });
      setViolations((prev) => [...prev, event]);

      const countable = options?.countable ?? COUNTABLE_VIOLATIONS.has(type);
      if (!countable) {
        scheduleIngest(type, metadata);
        return;
      }

      setViolationCount((prev) => {
        const next = prev + 1;
        if (type === 'tab_switch') {
          setTabSwitchCount((c) => c + 1);
        }
        scheduleIngest(type, { ...metadata, violationIndex: next });

        if (next >= PROCTOR_MAX_VIOLATIONS && !autoSubmitRef.current) {
          autoSubmitRef.current = true;
          setAutoSubmitTriggered(true);
          logExamViolation(sessionId, {
            type: 'auto_submit_violations',
            metadata: { violationCount: next },
          });
          scheduleIngest('auto_submit_violations', { violationCount: next });
          void flushIngest();
          maxViolationsRef.current?.({
            violationCount: next,
            violations: getExamViolations(sessionId),
          });
        }
        return next;
      });
    },
    [enabled, sessionId, scheduleIngest, flushIngest],
  );

  const { cameraReady, cameraError, faceStatus, faceNotVisible, startCamera, stopCamera } =
    useCameraProctoring({
      enabled: enabled && requireCamera,
      videoRef,
    });

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const recordTabSwitch = (metadata?: Record<string, unknown>) => {
      const now = Date.now();
      if (now - lastFocusViolationRef.current < PROCTOR_FOCUS_DEBOUNCE_MS) return;
      lastFocusViolationRef.current = now;
      recordViolation('tab_switch', metadata);
    };

    const onVisibility = () => {
      if (document.hidden) recordTabSwitch({ reason: 'visibility_hidden' });
    };
    const onBlur = () => recordTabSwitch({ reason: 'window_blur' });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current);
      }
      void flushIngest();
    };
  }, [enabled, recordViolation, flushIngest]);

  const enterFullscreen = useCallback(async () => {
    if (!document.documentElement.requestFullscreen) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* user denied */
    }
  }, []);

  return {
    violations,
    violationCount,
    tabSwitchCount,
    autoSubmitTriggered,
    cameraReady,
    cameraError,
    faceStatus,
    faceNotVisible,
    startCamera,
    stopCamera,
    enterFullscreen,
    recordViolation,
    maxViolations: PROCTOR_MAX_VIOLATIONS,
  };
}
