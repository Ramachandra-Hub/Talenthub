/** Normalize department labels for fuzzy comparison (case, punctuation, & vs and). */
export function normalizeDepartmentKey(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function departmentsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeDepartmentKey(a);
  const nb = normalizeDepartmentKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/** ElevateX / college-wide exams use "All departments" — match every branch. */
export function isOpenToAllDepartments(value: string | null | undefined): boolean {
  const key = normalizeDepartmentKey(value);
  return !key || key === 'all departments' || key === 'all' || key === 'every department';
}

export function targetDepartmentsMatchStudent(
  targetDepartments: unknown,
  department: string,
): boolean {
  const depts = Array.isArray(targetDepartments)
    ? (targetDepartments as string[])
    : typeof targetDepartments === 'string'
      ? [targetDepartments]
      : [];
  if (depts.length === 0) return true;
  if (depts.some((d) => isOpenToAllDepartments(d))) return true;
  return depts.some((d) => departmentsMatch(d, department));
}

export function examMatchesDepartment(
  exam: { department?: string | null; target_branches?: string[] | null },
  department: string,
): boolean {
  if (isOpenToAllDepartments(exam.department)) return true;
  if (departmentsMatch(exam.department, department)) return true;
  const branches = (exam.target_branches as string[] | null) ?? [];
  if (branches.some((b) => isOpenToAllDepartments(b))) return true;
  return branches.some((b) => departmentsMatch(b, department));
}
