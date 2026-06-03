import { PLACEMENT_DEPARTMENTS } from '@/lib/placement/config';
import { placementDepartmentIdFromBranch } from '@/lib/placement/student-candidate';

/** Map college roster / group department names to ElevateX placement department ids. */
export function placementDeptIdsFromCollegeDepartments(names: string[]): string[] {
  const ids = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const exact = PLACEMENT_DEPARTMENTS.find(
      (d) => d.name.toLowerCase() === name.toLowerCase(),
    );
    if (exact) {
      ids.add(exact.id);
      continue;
    }
    ids.add(placementDepartmentIdFromBranch(name));
  }
  return [...ids];
}
