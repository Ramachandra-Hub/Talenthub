import { ELEVATEX_TEST_ID } from '@/lib/elevatex';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';

export type ElevateXAttemptStatus = {
  completed: boolean;
  /** Whether the official ElevateX exam window is open (evalora_module_schedules). */
  examWindowOpen?: boolean;
  attemptId?: string;
  score?: number;
  completedAt?: string | null;
  /** True when the status API could not be reached — do not allow a new attempt. */
  statusError?: boolean;
  /** Server-resolved from admin config (students cannot override). */
  technicalFormat?: PlacementTechnicalFormat;
  departmentId?: string;
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
    if (!res.ok) return { completed: false, statusError: true };
    return (await res.json()) as ElevateXAttemptStatus;
  } catch {
    return { completed: false, statusError: true };
  }
}
