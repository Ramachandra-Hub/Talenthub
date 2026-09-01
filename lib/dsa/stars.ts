/** Candy-style 0–3 star rating for a day node on the journey map. */
export function computeDayStars(input: {
  status: string;
  codingSolved: number;
  codingRequired: number;
  mcqPercent: number | null;
  mcqAttempted: number;
  mcqRequired: number;
}): number {
  if (input.status === 'locked') return 0;

  const codingStars = Math.min(
    3,
    input.codingRequired > 0
      ? Math.round((input.codingSolved / input.codingRequired) * 3)
      : 0,
  );

  if (input.status !== 'completed') {
    return Math.min(3, Math.max(0, codingStars));
  }

  const mcqPct = input.mcqPercent ?? 0;
  if (input.codingSolved >= input.codingRequired && mcqPct >= 80) return 3;
  const minMcqPass = input.mcqRequired > 0 ? 50 : 0;
  if (input.codingSolved >= input.codingRequired && mcqPct >= minMcqPass) return 2;
  return 1;
}
