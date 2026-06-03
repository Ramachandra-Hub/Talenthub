/** Ramachandra College internal assessment — branding constants. */
export const COLLEGE = {
  name: 'RAMACHANDRA COLLEGE OF ENGINEERING',
  shortName: 'Ramachandra College',
  rce: 'RCE',
  /** Shown on landing page, login screens, and site header */
  departmentTitle: 'Training & Placement Department',
  portalSubtitle: 'Online Assessment Platform for Student Skill Evaluation',
  emailDomain: 'ramachandra.edu',
} as const;

/** @deprecated Use departmentTitle */
export const portalTitle = COLLEGE.departmentTitle;

/**
 * B.Tech / MBA branches at Ramachandra College of Engineering (RCEE), Eluru.
 * Source: https://www.rcee.ac.in/ — Courses Offered section.
 */
export const DEPARTMENTS = [
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical & Electronics Engineering',
  'Electronics & Communication Engineering',
  'Computer Science Engineering',
  'Computer Science Engineering (Cyber Security)',
  'Computer Science Engineering (Internet of Things)',
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence & Machine Learning',
  'Master of Computer Applications (MCA)',
  'Business Administration',
] as const;

export const ACADEMIC_YEARS = ['I Year', 'II Year', 'III Year', 'IV Year'] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type AcademicYear = (typeof ACADEMIC_YEARS)[number];
