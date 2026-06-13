'use client';

import { useEffect, useRef } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

const DEFAULT_SLOT_WINDOW_POLL_MS = 15_000;

type WindowStatus = {
  isScheduledExam?: boolean;
  windowOpen?: boolean;
};

/**
 * Poll the student's slot window while an exam is in progress.
 * When the slot end time passes, invoke onSlotClosed (typically auto-submit).
 */
export function useExamSlotWindowWatch(options: {
  testId: string;
  enabled: boolean;
  onSlotClosed: () => void;
  intervalMs?: number;
}) {
  const { testId, enabled, onSlotClosed, intervalMs = DEFAULT_SLOT_WINDOW_POLL_MS } = options;
  const firedRef = useRef(false);
  const onSlotClosedRef = useRef(onSlotClosed);

  useEffect(() => {
    onSlotClosedRef.current = onSlotClosed;
  }, [onSlotClosed]);

  useEffect(() => {
    if (!enabled || !testId.trim()) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled || firedRef.current) return;
      try {
        const res = await fetchWithAuth(
          `/api/student/exam-window-status?testId=${encodeURIComponent(testId)}`,
        );
        if (!res.ok || cancelled || firedRef.current) return;
        const json = (await res.json()) as WindowStatus;
        if (!json.isScheduledExam) return;
        if (json.windowOpen) return;
        firedRef.current = true;
        onSlotClosedRef.current();
      } catch {
        /* retry on next interval */
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, testId, intervalMs]);
}
