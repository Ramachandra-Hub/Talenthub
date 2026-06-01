import { DEPARTMENTS } from '@/lib/college-brand';

/** ElevateX test students — seed via `pnpm run seed:elevatex` or POST `/api/setup/seed-elevatex-sample`. */

export const ELEVATEX_SAMPLE_PASSWORD = 'ElevateX2026';

/** Slot 1 ElevateX dry-run (120 students). */
export const ELEVATEX_SAMPLE_SLOT = 1;
export const ELEVATEX_SAMPLE_COUNT = 120;

/** Previous 15 demo rolls — removed when re-seeding. */
export const LEGACY_ELEVATEX_SAMPLE_ROLLS = Array.from({ length: 15 }, (_, i) =>
  `EX260${String(i + 1).padStart(2, '0')}`,
);

export type ElevateXSampleStudent = {
  roll: string;
  fullName: string;
  department: string;
  year: string;
};

export function buildElevateXSampleStudents(count = ELEVATEX_SAMPLE_COUNT): ElevateXSampleStudent[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const roll = `EXS1${String(n).padStart(3, '0')}`;
    return {
      roll,
      fullName: `ElevateX Slot ${ELEVATEX_SAMPLE_SLOT} Test ${String(n).padStart(3, '0')}`,
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      year: 'III Year',
    };
  });
}

export const ELEVATEX_SAMPLE_STUDENTS = buildElevateXSampleStudents();

/** All demo rolls removed by reset (current set + legacy 15). */
export function allElevateXSampleRolls(): string[] {
  return [
    ...ELEVATEX_SAMPLE_STUDENTS.map((s) => s.roll),
    ...LEGACY_ELEVATEX_SAMPLE_ROLLS,
  ];
}
