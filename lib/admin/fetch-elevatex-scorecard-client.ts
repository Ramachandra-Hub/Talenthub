import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { PlacementScorecard } from '@/lib/placement/types';

export async function fetchElevateXScorecardForAdmin(
  attemptId: string,
  options?: { rollNumber?: string },
): Promise<{ scorecard: PlacementScorecard } | { error: string }> {
  const roll = options?.rollNumber?.trim();
  const qs = roll ? `?roll=${encodeURIComponent(roll)}` : '';
  const res = await fetchWithAuth(
    `/api/admin/elevatex/scorecard/${encodeURIComponent(attemptId)}${qs}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: json.error ?? 'Full section report is not available for this attempt.' };
  }
  const json = (await res.json()) as { scorecard?: PlacementScorecard };
  if (!json.scorecard) {
    return { error: 'Scorecard data was empty for this attempt.' };
  }
  return { scorecard: json.scorecard };
}
