import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import {
  PLACEMENT_TOTAL_SEC,
  defaultEnabledPlacementSectionIds,
  defaultTechnicalFormatForDepartment,
  getActivePlacementSections,
  getPlacementSection,
} from '@/lib/placement/config';
import { PROGRAMMING_SECTION_PROBLEM_COUNT } from '@/lib/placement/elevatex-exam-config';
import { buildPlacementQuestions } from '@/lib/placement/question-banks';
import type {
  PlacementCandidate,
  PlacementSectionId,
  PlacementSectionState,
  PlacementSession,
  PlacementTechnicalFormat,
} from '@/lib/placement/types';

type McqSectionId = Exclude<PlacementSectionId, 'speaking' | 'technical' | 'programming'>;

export type BuildPlacementSessionOptions = {
  enabledSections?: PlacementSectionId[];
  examDurationSec?: number;
  programmingProblems?: ProgrammingProblem[];
};

function resolveActiveSectionIds(candidate: PlacementCandidate): PlacementSectionId[] {
  return candidate.enabledSections?.length
    ? candidate.enabledSections
    : defaultEnabledPlacementSectionIds();
}

function resolveExamDurationSec(candidate: PlacementCandidate): number {
  return candidate.examDurationSec && candidate.examDurationSec > 0
    ? candidate.examDurationSec
    : PLACEMENT_TOTAL_SEC;
}

function buildTechnicalState(
  format: PlacementTechnicalFormat,
  banks: ReturnType<typeof buildPlacementQuestions>,
  existing?: PlacementSectionState,
): PlacementSectionState {
  const prev =
    existing?.kind === 'technical'
      ? existing
      : existing?.kind === 'coding'
        ? {
            kind: 'technical' as const,
            format,
            coding: {
              problems: existing.problems,
              submissions: existing.submissions,
            },
            completed: existing.completed,
          }
        : existing?.kind === 'mcq'
          ? {
              kind: 'technical' as const,
              format,
              mcq: { questions: existing.questions, answers: existing.answers },
              completed: existing.completed,
            }
          : undefined;

  const state: PlacementSectionState = {
    kind: 'technical',
    format,
    completed: prev?.kind === 'technical' ? prev.completed : false,
  };

  if (format === 'mcq' || format === 'both') {
    state.mcq = {
      questions: banks.technicalMcq,
      answers: prev?.kind === 'technical' ? (prev.mcq?.answers ?? {}) : {},
    };
  }
  if (format === 'coding' || format === 'both') {
    state.coding = {
      problems: banks.technicalCoding,
      submissions:
        prev?.kind === 'technical' ? (prev.coding?.submissions ?? {}) : {},
    };
  }
  return state;
}

function buildSectionStateForConfig(
  cfg: ReturnType<typeof getActivePlacementSections>[number],
  format: PlacementTechnicalFormat,
  banks: ReturnType<typeof buildPlacementQuestions>,
  existing?: PlacementSectionState,
): PlacementSectionState {
  if (cfg.kind === 'mcq') {
    const prev = existing?.kind === 'mcq' ? existing : undefined;
    return {
      kind: 'mcq',
      questions: banks[cfg.id as McqSectionId] ?? [],
      answers: prev?.answers ?? {},
      completed: prev?.completed ?? false,
    };
  }
  if (cfg.kind === 'technical') {
    return buildTechnicalState(format, banks, existing);
  }
  if (cfg.kind === 'coding') {
    const prev = existing?.kind === 'coding' ? existing : undefined;
    return {
      kind: 'coding',
      problems: banks.programming,
      submissions: prev?.submissions ?? {},
      completed: prev?.completed ?? false,
    };
  }
  const prev = existing?.kind === 'speaking' ? existing : undefined;
  return {
    kind: 'speaking',
    responses: prev?.responses ?? [],
    completed: prev?.completed ?? false,
  };
}

/** Fill missing/empty section pools (e.g. resumed sessions or older drafts). */
export function repairPlacementSession(session: PlacementSession): PlacementSession {
  const activeSectionIds =
    session.activeSectionIds?.length ? session.activeSectionIds : resolveActiveSectionIds(session.candidate);
  const activeSections = getActivePlacementSections(activeSectionIds);
  const format =
    session.candidate.technicalFormat ??
    defaultTechnicalFormatForDepartment(session.candidate.departmentId);
  const banks = buildPlacementQuestions({
    seed: session.candidate.seed,
    departmentId: session.candidate.departmentId,
    technicalFormat: format,
    enabledSections: activeSectionIds,
    programmingProblems: session.programmingProblemBank ?? [],
  });
  const sectionStates = { ...session.sectionStates };
  let changed = false;

  for (const cfg of activeSections) {
    const sectionId = cfg.id;
    const state = sectionStates[sectionId];
    let needsRepair = false;

    if (cfg.kind === 'mcq') {
      needsRepair =
        !state ||
        state.kind !== 'mcq' ||
        !Array.isArray(state.questions) ||
        state.questions.length === 0;
    } else if (cfg.kind === 'technical') {
      const needsMcq =
        (format === 'mcq' || format === 'both') &&
        (!state ||
          state.kind !== 'technical' ||
          !state.mcq?.questions?.length);
      const codingProblems = state?.kind === 'technical' ? state.coding?.problems : undefined;
      const codingCasesMissing =
        Array.isArray(codingProblems) &&
        codingProblems.some(
          (p) =>
            !Array.isArray(p.testCases) ||
            p.testCases.length === 0 ||
            p.testCases.length > 1,
        );
      const needsCoding =
        (format === 'coding' || format === 'both') &&
        (!state ||
          state.kind !== 'technical' ||
          !state.coding?.problems?.length ||
          codingCasesMissing);
      const formatMismatch = state?.kind === 'technical' && state.format !== format;
      needsRepair = needsMcq || needsCoding || formatMismatch;
    } else if (cfg.kind === 'coding') {
      needsRepair =
        !state ||
        state.kind !== 'coding' ||
        !Array.isArray(state.problems) ||
        state.problems.length === 0;
    } else {
      needsRepair = !state || state.kind !== 'speaking';
    }

    if (!needsRepair) continue;

    sectionStates[sectionId] = buildSectionStateForConfig(cfg, format, banks, state);
    changed = true;
  }

  const candidate =
    session.candidate.technicalFormat === format &&
    session.candidate.enabledSections?.join() === activeSectionIds.join()
      ? session.candidate
      : {
          ...session.candidate,
          technicalFormat: format,
          enabledSections: activeSectionIds,
        };

  const currentIndex = Math.min(
    session.currentSectionIndex,
    Math.max(0, activeSectionIds.length - 1),
  );

  if (
    changed ||
    candidate !== session.candidate ||
    session.activeSectionIds?.join() !== activeSectionIds.join() ||
    currentIndex !== session.currentSectionIndex
  ) {
    return {
      ...session,
      candidate,
      activeSectionIds,
      currentSectionIndex: currentIndex,
      sectionStates,
    };
  }
  return session;
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

/** Build the initial session given a candidate. */
export function buildPlacementSession(
  candidate: PlacementCandidate,
  options: BuildPlacementSessionOptions = {},
): PlacementSession {
  const activeSectionIds =
    options.enabledSections ?? resolveActiveSectionIds(candidate);
  const activeSections = getActivePlacementSections(activeSectionIds);
  const format = candidate.technicalFormat;
  const programmingBank = options.programmingProblems ?? [];
  const banks = buildPlacementQuestions({
    seed: candidate.seed,
    departmentId: candidate.departmentId,
    technicalFormat: format,
    enabledSections: activeSectionIds,
    programmingProblems: programmingBank,
  });
  const sectionStates: Partial<Record<PlacementSectionId, PlacementSectionState>> = {};

  for (const cfg of activeSections) {
    sectionStates[cfg.id] = buildSectionStateForConfig(cfg, format, banks);
  }

  const examDurationSec = resolveExamDurationSec(candidate);

  return {
    version: 1,
    candidate: {
      ...candidate,
      enabledSections: activeSectionIds,
      examDurationSec,
    },
    activeSectionIds,
    programmingProblemBank: programmingBank.length ? programmingBank : undefined,
    sectionStates,
    currentSectionIndex: 0,
    sectionTimeLeftSec: 0,
    globalTimeLeftSec: examDurationSec,
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
  const totalSec = resolveExamDurationSec(session.candidate);
  const startedMs = new Date(session.candidate.startedAt).getTime();
  if (Number.isFinite(startedMs) && startedMs > 0) {
    const elapsedSec = Math.floor((nowMs - startedMs) / 1000);
    return Math.max(0, totalSec - elapsedSec);
  }
  return Math.max(0, Math.min(totalSec, session.globalTimeLeftSec));
}

export function syncSessionTimer(session: PlacementSession): PlacementSession {
  if (session.submitted) return session;
  return { ...session, globalTimeLeftSec: deriveGlobalTimeLeftSec(session) };
}

/** Handoff from start page → take page only (not a durable resume draft). */
export function saveSession(session: PlacementSession): void {
  if (typeof window === 'undefined') return;
  const synced = syncSessionTimer(session);
  try {
    window.sessionStorage.setItem(PLACEMENT_DRAFT_SESSION_KEY, JSON.stringify(synced));
  } catch {
    // quota / private browsing — best effort
  }
}

/** Remove in-flight exam handoff so refresh/back cannot resume the paper. */
export function consumePlacementSessionHandoff(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PLACEMENT_DRAFT_SESSION_KEY);
  } catch {
    // ignore
  }
}

function parseStoredSession(raw: string | null): PlacementSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PlacementSession;
    if (parsed?.version !== 1) return null;
    if (!parsed.activeSectionIds?.length) {
      parsed.activeSectionIds = resolveActiveSectionIds(parsed.candidate);
    }
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

/** @deprecated Exams no longer support resume — use {@link loadSession} for one-time handoff only. */
export function loadActivePlacementSession(hallTicket: string): PlacementSession | null {
  if (!hallTicket) return null;
  const fromSession = loadSession();
  if (
    !fromSession ||
    fromSession.submitted ||
    fromSession.candidate.hallTicket !== hallTicket
  ) {
    return null;
  }
  return syncSessionTimer(fromSession);
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

export function activePlacementSectionsForSession(session: PlacementSession) {
  const ids =
    session.activeSectionIds?.length
      ? session.activeSectionIds
      : session.candidate.enabledSections?.length
        ? session.candidate.enabledSections
        : defaultEnabledPlacementSectionIds();
  return getActivePlacementSections(ids);
}
