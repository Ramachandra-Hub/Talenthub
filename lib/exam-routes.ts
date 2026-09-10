/** Routes where account chrome (email, dashboard links) should stay hidden during exams. */
export function isExamFocusRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/tests/take')) return true;
  if (pathname.startsWith('/tests/competitive-exam/take')) return true;
  if (pathname.startsWith('/tests/programming')) return true;
  if (pathname.startsWith('/placement/take')) return true;
  if (pathname.startsWith('/open-coding')) return true;
  if (pathname === '/coding') return true;
  return false;
}
