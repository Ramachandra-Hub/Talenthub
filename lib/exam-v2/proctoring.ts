export type ExamViolationType =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'copy_paste'
  | 'visibility_hidden'
  | 'multiple_monitors_suspected'
  | 'face_not_visible'
  | 'face_absent'
  | 'multiple_faces'
  | 'face_suspicious'
  | 'camera_denied'
  | 'auto_submit_violations';

export interface ExamViolationEvent {
  type: ExamViolationType;
  at: string;
  metadata?: Record<string, unknown>;
}

export function logExamViolation(
  sessionKey: string,
  event: Omit<ExamViolationEvent, 'at'> & { at?: string },
): ExamViolationEvent {
  const full: ExamViolationEvent = {
    ...event,
    at: event.at ?? new Date().toISOString(),
  };
  if (typeof window === 'undefined') return full;

  const key = `examViolations:${sessionKey}`;
  const prev = JSON.parse(sessionStorage.getItem(key) ?? '[]') as ExamViolationEvent[];
  prev.push(full);
  sessionStorage.setItem(key, JSON.stringify(prev.slice(-100)));
  return full;
}

export function getExamViolations(sessionKey: string): ExamViolationEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(`examViolations:${sessionKey}`) ?? '[]') as ExamViolationEvent[];
  } catch {
    return [];
  }
}

const COUNTABLE_VIOLATION_TYPES = new Set<ExamViolationType>(['tab_switch']);

/** How many incidents count toward the auto-submit limit (tab switches). */
export function countCountableExamViolations(events: ExamViolationEvent[]): {
  violationCount: number;
  tabSwitchCount: number;
} {
  let violationCount = 0;
  let tabSwitchCount = 0;
  for (const event of events) {
    if (!COUNTABLE_VIOLATION_TYPES.has(event.type)) continue;
    violationCount += 1;
    if (event.type === 'tab_switch') tabSwitchCount += 1;
  }
  return { violationCount, tabSwitchCount };
}

export function testProctorSessionStorageKey(testId: string): string {
  return `exam:proctorSession:${testId.trim()}`;
}

export function loadTestProctorSessionId(testId: string): string | null {
  if (typeof window === 'undefined' || !testId.trim()) return null;
  try {
    return sessionStorage.getItem(testProctorSessionStorageKey(testId));
  } catch {
    return null;
  }
}

export function saveTestProctorSessionId(testId: string, sessionId: string): void {
  if (typeof window === 'undefined' || !testId.trim() || !sessionId) return;
  try {
    sessionStorage.setItem(testProctorSessionStorageKey(testId), sessionId);
  } catch {
    // ignore
  }
}

export function clearTestProctorSessionId(testId: string): void {
  if (typeof window === 'undefined' || !testId.trim()) return;
  try {
    sessionStorage.removeItem(testProctorSessionStorageKey(testId));
  } catch {
    // ignore
  }
}

/** Merge server-stored proctor events into sessionStorage when local state was lost. */
export function mergeExamViolations(
  sessionKey: string,
  incoming: Array<{ type: string; at: string; metadata?: Record<string, unknown> }>,
): ExamViolationEvent[] {
  if (typeof window === 'undefined' || !sessionKey.trim() || !incoming.length) {
    return getExamViolations(sessionKey);
  }

  const existing = getExamViolations(sessionKey);
  const seen = new Set(existing.map((e) => `${e.type}:${e.at}`));
  let changed = false;

  for (const row of incoming) {
    const type = row.type as ExamViolationType;
    const at = row.at;
    const key = `${type}:${at}`;
    if (!at || seen.has(key)) continue;
    seen.add(key);
    existing.push({ type, at, metadata: row.metadata });
    changed = true;
  }

  if (changed) {
    sessionStorage.setItem(`examViolations:${sessionKey}`, JSON.stringify(existing.slice(-100)));
  }
  return existing;
}

export function createProctorSessionId(testId: string, userId?: string): string {
  const uid = userId ?? 'guest';
  return `proctor-${testId}-${uid}-${Date.now()}`;
}
