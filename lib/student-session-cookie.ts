import { randomUUID } from 'crypto';

export const STUDENT_SESSION_COOKIE = 'rce_student_session';

export function createStudentSessionId(): string {
  return randomUUID();
}

export function readStudentSessionIdFromRequest(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${STUDENT_SESSION_COOKIE}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return null;
  }
}

export function studentSessionCookieHeader(sessionId: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${STUDENT_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${isProd ? '; Secure' : ''}`;
}

export function clearStudentSessionCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${STUDENT_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`;
}
