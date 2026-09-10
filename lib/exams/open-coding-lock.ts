/** HttpOnly cookie that locks a student into the open-coding exam surface only. */
export const OPEN_CODING_LOCK_COOKIE = 'th_open_coding_lock';

export function openCodingLockCookieHeader(examId: string, durationMinutes: number): string {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = Math.max(60 * 60, (durationMinutes + 30) * 60);
  return `${OPEN_CODING_LOCK_COOKIE}=${encodeURIComponent(examId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProd ? '; Secure' : ''}`;
}

export function clearOpenCodingLockCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${OPEN_CODING_LOCK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`;
}

export function readOpenCodingLockExamIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${OPEN_CODING_LOCK_COOKIE}=([^;]+)`),
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return null;
  }
}

export function isOpenCodingLockAllowedPage(pathname: string, examId: string): boolean {
  if (pathname.startsWith(`/open-coding/${examId}`)) return true;
  if (pathname.startsWith('/join/')) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

export function isOpenCodingLockBlockedPage(pathname: string): boolean {
  if (pathname.startsWith('/open-coding/')) return false;
  if (pathname.startsWith('/join/')) return false;
  if (pathname.startsWith('/auth/')) return false;
  if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf)$/i.test(pathname)) return false;

  return (
    pathname === '/' ||
    pathname.startsWith('/dsa') ||
    pathname.startsWith('/dsa-arena') ||
    pathname.startsWith('/contests') ||
    pathname.startsWith('/home') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/learning') ||
    pathname.startsWith('/leaderboard') ||
    pathname.startsWith('/achievements') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/exams') ||
    pathname.startsWith('/placement') ||
    pathname.startsWith('/ai') ||
    pathname.startsWith('/practice') ||
    pathname.startsWith('/coding') ||
    pathname.startsWith('/tests')
  );
}

export function isOpenCodingLockAllowedApi(pathname: string): boolean {
  return (
    pathname.startsWith('/api/student/open-coding') ||
    pathname.startsWith('/api/v2/coding') ||
    pathname.startsWith('/api/v2/proctor') ||
    pathname.startsWith('/api/storage/proctor') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/exams/open') ||
    pathname === '/api/student/me' ||
    pathname.startsWith('/api/student/session')
  );
}
