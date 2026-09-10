import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Auth.js JWT / session cookie values are cookie-safe (base64url / JWE).
 * encodeURIComponent corrupts them so the next request cannot decode the session → 401.
 */
function serializeSessionCookie(name: string, value: string, isProd: boolean): string {
  const needsSecure =
    isProd || name.startsWith('__Secure-') || name.startsWith('__Host-');
  // Escape only characters that would break the Set-Cookie header.
  const safeValue = value.replace(/[%\s;,\\]/g, (ch) => encodeURIComponent(ch));
  return `${name}=${safeValue}; Path=/; HttpOnly; SameSite=Lax${needsSecure ? '; Secure' : ''}`;
}

/** Attach NextAuth session cookies (and optional extras) to a Route Handler JSON response. */
export async function copyAuthSessionCookiesToResponse(
  response: Response,
  studentSessionId?: string,
  extraSetCookies?: string[],
): Promise<NextResponse> {
  const jar = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  const headers = new Headers(response.headers);

  for (const c of jar.getAll()) {
    if (!c.name.includes('authjs') && !c.name.includes('next-auth')) continue;
    headers.append('Set-Cookie', serializeSessionCookie(c.name, c.value, isProd));
  }

  if (studentSessionId) {
    const { studentSessionCookieHeader } = await import('@/lib/student-session-cookie');
    headers.append('Set-Cookie', studentSessionCookieHeader(studentSessionId));
  }

  for (const cookie of extraSetCookies ?? []) {
    if (cookie?.trim()) headers.append('Set-Cookie', cookie);
  }

  const bodyText = await response.text();
  return new NextResponse(bodyText, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
