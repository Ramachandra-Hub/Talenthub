import { COLLEGE } from '@/lib/college-brand';

const domain = COLLEGE.emailDomain;

/** Map roll number to AWS RDS auth email (backward compatible if full email entered). */
export function studentAuthEmail(rollOrEmail: string): string {
  const v = rollOrEmail.trim().toLowerCase();
  if (v.includes('@')) return v;
  const roll = v.replace(/\s+/g, '');
  return `${roll}@student.${domain}`;
}

/** Map employee ID to AWS RDS auth email. */
export function facultyAuthEmail(employeeId: string): string {
  const v = employeeId.trim().toLowerCase();
  if (v.includes('@')) return v;
  const id = v.replace(/\s+/g, '');
  return `${id}@faculty.${domain}`;
}

/** Map admin username to AWS RDS auth email. */
export function adminAuthEmail(username: string): string {
  const v = username.trim().toLowerCase();
  if (v.includes('@')) return v;
  const user = v.replace(/\s+/g, '');
  return `${user}@admin.${domain}`;
}

export function validateRollNumber(roll: string): string | null {
  const v = roll.trim();
  if (!v) return 'Roll number is required';
  if (v.length < 4) return 'Enter a valid roll / registration number';
  if (!/^[@.\w-]+$/i.test(v.replace(/@.+$/, ''))) return 'Invalid characters in roll number';
  return null;
}

export function validateEmployeeId(id: string): string | null {
  const v = id.trim();
  if (!v) return 'Employee ID is required';
  if (v.length < 3) return 'Enter a valid employee ID';
  return null;
}

export function validateAdminUsername(username: string): string | null {
  const v = username.trim();
  if (!v) return 'Admin username is required';
  if (v.length < 3) return 'Enter a valid admin username';
  return null;
}

export const ADMIN_PASSWORD_MIN = 6;

export function validatePassword(password: string, min = 8): string | null {
  if (!password) return 'Password is required';
  if (password.length < min) return `Password must be at least ${min} characters`;
  return null;
}

/** Admin portal — allows the institutional default (7 chars). */
export function validateAdminPassword(password: string): string | null {
  return validatePassword(password, ADMIN_PASSWORD_MIN);
}
