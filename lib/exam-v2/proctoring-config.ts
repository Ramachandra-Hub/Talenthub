/** Max integrity incidents before the exam auto-submits. */
export const PROCTOR_MAX_VIOLATIONS = 7;

/**
 * Violation types that count toward PROCTOR_MAX_VIOLATIONS / auto-submit.
 * Tab/focus loss only — camera preview is advisory (no auto-submit from face detection).
 */
export const PROCTOR_AUTO_SUBMIT_VIOLATION_TYPES = ['tab_switch'] as const;

/** Seconds without a visible face before showing the red on-screen reminder (not a flag). */
export const PROCTOR_FACE_ABSENT_SEC = 5;

/** Camera scan interval — ~2.5 FPS keeps CPU low at scale (1000+ concurrent clients). */
export const PROCTOR_FACE_CHECK_MS = 400;

/** Debounce duplicate tab/focus signals (blur + visibilitychange fire together, OS lock fires both). */
export const PROCTOR_FOCUS_DEBOUNCE_MS = 4000;

/** Minimum gap between repeated suspicious-face incidents. */
export const PROCTOR_SUSPICIOUS_DEBOUNCE_MS = 12000;

/** Batch violation ingest to reduce HTTP chatter (still low volume per student). */
export const PROCTOR_INGEST_FLUSH_MS = 2000;

export type ProctorSubmitReason = 'manual' | 'timeout' | 'proctor_violations';

export type ProctorSummary = {
  sessionId: string;
  violationCount: number;
  autoSubmitted: boolean;
  submitReason: ProctorSubmitReason;
  violations: Array<{ type: string; at: string }>;
};
