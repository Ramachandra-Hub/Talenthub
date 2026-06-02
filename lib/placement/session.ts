import { PLACEMENT_SECTIONS, PLACEMENT_TOTAL_SEC, getPlacementSection } from '@/lib/placement/config';
import { buildPlacementQuestions } from '@/lib/placement/question-banks';
import type {
  PlacementCandidate,
  PlacementSectionId,
  PlacementSectionState,
  PlacementSession,
} from '@/lib/placement/types';

type McqSectionId = Exclude<PlacementSectionId, 'speaking'>;

/** Fill missing/empty MCQ pools (e.g. resumed sessions or older drafts). */
export function repairPlacementSession(session: PlacementSession): PlacementSession {
  const banks = buildPlacementQuestions(session.candidate.seed, session.candidate.departmentId);
  const sectionStates = { ...session.sectionStates };
  let changed = false;

  for (const cfg of PLACEMENT_SECTIONS) {
    if (cfg.kind !== 'mcq') continue;
    const sectionId = cfg.id as McqSectionId;
    const expected = getPlacementSection(sectionId).questionCount ?? 0;
    const state = sectionStates[sectionId];
    const needsRepair =
      !state ||
      state.kind !== 'mcq' ||
      !Array.isArray(state.questions) ||
      state.questions.length < Math.min(expected, 1);

    if (!needsRepair) continue;

    const existingAnswers = state?.kind === 'mcq' ? state.answers : {};
    const completed = state?.kind === 'mcq' ? state.completed : false;
    sectionStates[sectionId] = {
      kind: 'mcq',
      questions: banks[sectionId] ?? [],
      answers: existingAnswers,
      completed,
    };
    changed = true;
  }

  if (!sectionStates.speaking || sectionStates.speaking.kind !== 'speaking') {
    sectionStates.speaking = { kind: 'speaking', responses: [], completed: false };
    changed = true;
  }

  return changed ? { ...session, sectionStates } : session;
}

export const PLACEMENT_DRAFT_CANDIDATE_KEY = 'placement:candidate';
export const PLACEMENT_DRAFT_SESSION_KEY = 'placement:session';
export const PLACEMENT_LAST_SCORECARD_PREFIX = 'placement:scorecard:';
export const PLACEMENT_COMPLETED_PREFIX = 'placement:completed:';
export const PLACEMENT_PROCTOR_SESSION_KEY = 'placement:proctorSessionId';

export function loadPlacementProctorSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PLACEMENT_PROCTOR_SESSION_KEY);
  } catch {
    return null;
  }
}

export function savePlacementProctorSessionId(sessionId: string): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    window.sessionStorage.setItem(PLACEMENT_PROCTOR_SESSION_KEY, sessionId);
  } catch {
    // ignore
  }
}

export function clearPlacementProctorSessionId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PLACEMENT_PROCTOR_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function markPlacementCompleted(hallTicket: string, attemptId: string): void {
  if (typeof window === 'undefined' || !hallTicket || !attemptId) return;
  try {
    window.localStorage.setItem(
      `${PLACEMENT_COMPLETED_PREFIX}${hallTicket}`,
      JSON.stringify({ attemptId, at: new Date().toISOString() }),
    );
  } catch {
    // ignore
  }
}

export function getPlacementCompletedAttemptId(hallTicket: string): string | null {
  if (typeof window === 'undefined' || !hallTicket) return null;
  try {
    const raw = window.localStorage.getItem(`${PLACEMENT_COMPLETED_PREFIX}${hallTicket}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { attemptId?: string };
    return parsed.attemptId?.trim() || null;
  } catch {
    return null;
  }
}

/** Build the initial session given a candidate. Resets if storage already has one. */
export function buildPlacementSession(candidate: PlacementCandidate): PlacementSession {
  const banks = buildPlacementQuestions(candidate.seed, candidate.departmentId);
  const sectionStates = {} as Record<PlacementSectionId, PlacementSectionState>;

  for (const cfg of PLACEMENT_SECTIONS) {
    if (cfg.kind === 'mcq') {
      const questions = banks[cfg.id as Exclude<PlacementSectionId, 'speaking'>] ?? [];
      sectionStates[cfg.id] = {
        kind: 'mcq',
        questions,
        answers: {},
        completed: false,
      };
    } else {
      sectionStates[cfg.id] = {
        kind: 'speaking',
        responses: [],
        completed: false,
      };
    }
  }

  return {
    version: 1,
    candidate,
    sectionStates,
    currentSectionIndex: 0,
    sectionTimeLeftSec: 0,
    globalTimeLeftSec: PLACEMENT_TOTAL_SEC,
    submitted: false,
  };
}

export function saveCandidateDraft(candidate: PlacementCandidate): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PLACEMENT_DRAFT_CANDIDATE_KEY, JSON.stringify(candidate));
  } catch {
    // ignore
  }
}

export function loadCandidateDraft(): PlacementCandidate | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PLACEMENT_DRAFT_CANDIDATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlacementCandidate;
  } catch {
    return null;
  }
}

/** Remaining exam time from wall clock (survives refresh; does not reset to 60:00). */
export function deriveGlobalTimeLeftSec(
  session: PlacementSession,
  nowMs = Date.now(),
): number {
  const startedMs = new Date(session.candidate.startedAt).getTime();
  if (Number.isFinite(startedMs) && startedMs > 0) {
    const elapsedSec = Math.floor((nowMs - startedMs) / 1000);
    return Math.max(0, PLACEMENT_TOTAL_SEC - elapsedSec);
  }
  return Math.max(0, Math.min(PLACEMENT_TOTAL_SEC, session.globalTimeLeftSec));
}

export function syncSessionTimer(session: PlacementSession): PlacementSession {
  if (session.submitted) return session;
  return { ...session, globalTimeLeftSec: deriveGlobalTimeLeftSec(session) };
}

export function saveSession(session: PlacementSession): void {
  if (typeof window === 'undefined') return;
  const synced = syncSessionTimer(session);
  try {
    window.sessionStorage.setItem(PLACEMENT_DRAFT_SESSION_KEY, JSON.stringify(synced));
    // Mirror to localStorage so a refresh / disconnect can resume on the same device.
    window.localStorage.setItem(
      `${PLACEMENT_DRAFT_SESSION_KEY}:${synced.candidate.hallTicket}`,
      JSON.stringify(synced),
    );
  } catch {
    // quota / private browsing — best effort
  }
}

function parseStoredSession(raw: string | null): PlacementSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PlacementSession;
    if (parsed?.version !== 1) return null;
    const repaired = repairPlacementSession(parsed);
    if (repaired.submitted) return repaired;
    return syncSessionTimer(repaired);
  } catch {
    return null;
  }
}

export function loadSession(): PlacementSession | null {
  if (typeof window === 'undefined') return null;
  return parseStoredSession(window.sessionStorage.getItem(PLACEMENT_DRAFT_SESSION_KEY));
}

export function loadSessionByHallTicket(hallTicket: string): PlacementSession | null {
  if (typeof window === 'undefined' || !hallTicket) return null;
  return parseStoredSession(
    window.localStorage.getItem(`${PLACEMENT_DRAFT_SESSION_KEY}:${hallTicket}`),
  );
}

/** Prefer durable localStorage draft, then sessionStorage — keeps timer + answers on refresh. */
export function loadActivePlacementSession(hallTicket: string): PlacementSession | null {
  if (!hallTicket) return null;
  const fromLocal = loadSessionByHallTicket(hallTicket);
  const fromSession = loadSession();
  const picked =
    fromLocal && !fromLocal.submitted && fromLocal.candidate.hallTicket === hallTicket
      ? fromLocal
      : fromSession &&
          !fromSession.submitted &&
          fromSession.candidate.hallTicket === hallTicket
        ? fromSession
        : null;
  return picked ? syncSessionTimer(picked) : null;
}

export function clearPlacementDrafts(hallTicket?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PLACEMENT_DRAFT_SESSION_KEY);
    window.sessionStorage.removeItem(PLACEMENT_DRAFT_CANDIDATE_KEY);
    if (hallTicket) {
      window.localStorage.removeItem(`${PLACEMENT_DRAFT_SESSION_KEY}:${hallTicket}`);
      window.localStorage.removeItem(`${PLACEMENT_COMPLETED_PREFIX}${hallTicket}`);
    }
  } catch {
    // ignore
  }
}

export function saveScorecardForAttempt(attemptId: string, scorecardJson: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${PLACEMENT_LAST_SCORECARD_PREFIX}${attemptId}`,
      JSON.stringify(scorecardJson),
    );
  } catch {
    // ignore
  }
}

export function loadScorecardForAttempt<T>(attemptId: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${PLACEMENT_LAST_SCORECARD_PREFIX}${attemptId}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
