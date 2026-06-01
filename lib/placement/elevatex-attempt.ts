import { ELEVATEX_TEST_ID } from '@/lib/elevatex';

export type ElevateXAttemptStatus = {
  completed: boolean;
  attemptId?: string;
  score?: number;
  completedAt?: string | null;
};

export function getElevateXTestId(): string {
  return ELEVATEX_TEST_ID;
}

export async function fetchElevateXAttemptStatus(
  rollNumber?: string,
): Promise<ElevateXAttemptStatus> {
  try {
    const query =
      rollNumber?.trim() ? `?rollNumber=${encodeURIComponent(rollNumber.trim())}` : '';
    const res = await fetch(`/api/student/elevatex/attempt-status${query}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return { completed: false };
    return (await res.json()) as ElevateXAttemptStatus;
  } catch {
    return { completed: false };
  }
}
