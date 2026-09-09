import { CONTEST_PROBLEM_COUNT } from '@/lib/dsa/contest/types';

export function assertContestPublishable(problemCount: number): void {
  if (problemCount !== CONTEST_PROBLEM_COUNT) {
    const err = new Error(
      `Published contests must contain exactly ${CONTEST_PROBLEM_COUNT} problems (found ${problemCount}).`,
    );
    (err as Error & { status: number }).status = 400;
    throw err;
  }
}
