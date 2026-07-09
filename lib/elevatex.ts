/** ElevateX — Talent Challenge Exam (placement-readiness). RMSET uses separate branding. */

export const ELEVATEX_EXAM_NAME = 'ElevateX';
export const ELEVATEX_CHALLENGE_TITLE = 'ElevateX · Talent Challenge';
export const ELEVATEX_TAGLINE =
  'Industry-aligned talent challenge to identify Day-1-ready candidates for priority placements.';

export const ELEVATEX_SHORT_OBJECTIVE =
  'ElevateX identifies high-potential students for structured industry training and priority access to top job packages, internships, and hackathons — built around what recruiters expect from a Day-1 hire.';

export const ELEVATEX_REGISTRATION = {
  eligibility: 'All Branches · II Year 1st Semester (upcoming batch)',
  timeSlots: 'As listed in the registration form',
  mode: 'In-campus · Offline',
  duration: '1 Hour',
  passingNote: 'Cutoff as announced by the Examination Cell',
} as const;

export const ELEVATEX_TEST_COMPONENTS = [
  {
    name: 'C Language Assessment',
    questions: '20 MCQs + 3 Coding Questions',
    description:
      'Fundamentals of C Programming, Variables, Data Types, Operators, Input/Output, Control Statements, Loops, Functions, Arrays, Strings, Pointers, Structures, File Handling, and Problem-Solving using C Programming',
  },
] as const;

/** Shown on the student instructions page after login. */
export const ELEVATEX_EXAM_INSTRUCTIONS = [
  'One attempt only — each student may submit ElevateX exactly once while it is live.',
  'Complete the assessment within the allotted time.',
  'Read every question carefully before answering.',
  'There is no negative marking unless otherwise announced by the Examination Cell.',
  'Proctoring — camera and tab monitoring (same as RMSET); violations may auto-submit your paper.',
  'If you leave, refresh, or close the assessment, you cannot continue your attempt. Finish the assessment in one sitting or submit before exiting.',
  'After answering all questions, review your responses and click Submit Test to complete your assessment.',
] as const;

export const ELEVATEX_MODULE_KEY = 'placement_full' as const;

/** Canonical test id — one completed ElevateX attempt per student (all branches). */
export const ELEVATEX_TEST_ID = ELEVATEX_MODULE_KEY;

export function isElevateXModule(moduleKey: string | undefined | null): boolean {
  return moduleKey === ELEVATEX_MODULE_KEY;
}

/** Legacy rows used `placement-{department}`; treat those as the same exam. */
export function isElevateXTestId(testId: string | null | undefined): boolean {
  const id = String(testId ?? '').trim().toLowerCase();
  if (!id) return false;
  if (id === ELEVATEX_TEST_ID) return true;
  return id.startsWith('placement-');
}

export function isElevateXAttemptTitle(title: string | null | undefined): boolean {
  return /\belevatex\b/i.test(String(title ?? ''));
}
