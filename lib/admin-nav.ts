export const ADMIN_NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Overview', description: 'College-wide performance summary' },
  {
    href: '/admin/reports',
    label: 'Test reports',
    description: 'Per-exam dashboards — filter students and download PDF/CSV reports',
  },
  { href: '/admin/exam-builder', label: 'Exam builder', description: 'Create exams, slot rosters, and publish schedules' },
  { href: '/admin/exams', label: 'Exam Builder Pro', description: 'Create subject-mapped exams with full CRUD controls' },
  { href: '/admin/rmset', label: 'RMSET', description: 'Select topics and publish the eligibility test paper' },
  { href: '/admin/evalora-modules', label: 'ElevateX & modules', description: 'Go live with ElevateX and other scheduled assessments' },
  { href: '/admin/exam-schedules', label: 'Exam schedules', description: 'Go live per slot for department exams' },
  { href: '/admin/questions', label: 'Questions', description: 'Question bank and MCQ management' },
  { href: '/admin/tests', label: 'Tests', description: 'Live, upcoming, and ended tests with attempt stats' },
  { href: '/admin/test-attempts', label: 'Attempt monitor', description: 'Raw attempt log and status filters' },
  { href: '/admin/users', label: 'Users', description: 'Registered students and profiles' },
  { href: '/admin/ai-generator', label: 'AI generator', description: 'Generate MCQs with AI' },
  { href: '/admin/proctoring', label: 'Proctoring', description: 'Exam integrity and session flags' },
] as const;

export type AdminNavHref = (typeof ADMIN_NAV_ITEMS)[number]['href'];
