'use client';

export type ClientUser = {
  id: string;
  email?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
};

export function isAwsClientMode(): boolean {
  if (process.env.NEXT_PUBLIC_USE_AWS_STACK === 'false') return false;
  if (process.env.NEXT_PUBLIC_USE_AWS_STACK === 'true') return true;
  return true;
}

function fetchWithTimeout(input: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return fetch(input, {
    credentials: 'include',
    cache: 'no-store',
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timer));
}

/** Resolve logged-in user via server session (NextAuth + RDS). */
export async function getClientUser(): Promise<ClientUser | null> {
  try {
    const meRes = await fetchWithTimeout('/api/student/me', 8000);
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        authenticated?: boolean;
        id?: string;
        email?: string | null;
        role?: string;
      };
      if (me.authenticated && me.id) {
        return {
          id: me.id,
          email: me.email ?? undefined,
          role: me.role ?? 'student',
          user_metadata: { role: me.role ?? 'student' },
        };
      }
      return null;
    }

    if (meRes.status >= 500) return null;

    const res = await fetchWithTimeout('/api/auth/session', 8000);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      user?: { id?: string; email?: string; role?: string };
    };
    if (!json.user?.id) return null;
    return {
      id: json.user.id,
      email: json.user.email,
      role: json.user.role,
      user_metadata: { role: json.user.role },
    };
  } catch {
    return null;
  }
}

/** @deprecated Use getClientUser */
export async function getBrowserAuthUser(): Promise<ClientUser | null> {
  return getClientUser();
}

export async function signOutClient(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    /* ignore */
  }
}

/** Fetch helper with session cookies (NextAuth). */
export async function fetchWithSession(input: RequestInfo, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'include', cache: 'no-store' });
}

export {
  isClientAuthConfigured,
  isMissingPublicDbConfigError,
  AUTH_SETUP_MESSAGE,
} from '@/lib/client-auth-env';
