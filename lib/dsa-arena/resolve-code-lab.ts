/**
 * @deprecated Production Code Lab resolution is authoritative via
 * `resolveJourneyMissionForStudent` (`lib/dsa/journey-missions.ts`).
 *
 * This module no longer performs dayNumberHint / title / soft fallbacks.
 * It only re-exports types used by Arena page frames for dashboard typing.
 */

export type ApiDay = {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
};

export type ApiWeek = {
  id: string;
  title: string;
  topicName: string;
  topicSlug?: string;
  status: string;
  days: ApiDay[];
};

export type ApiDashboard = {
  weeks?: ApiWeek[];
  currentWeek?: ApiWeek;
};

/**
 * Production heuristic resolver has been removed (fail-closed).
 * Always returns null — use GET /api/student/dsa/journey/missions/[missionKey].
 */
export function resolveCodeLabHref(
  _topic?: unknown,
  _mission?: unknown,
  _dashboard?: ApiDashboard | null,
): string | null {
  return null;
}
