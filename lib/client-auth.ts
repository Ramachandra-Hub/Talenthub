'use client';

export type ClientUser = {
  id: string;
  email?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
};

export function isAwsClientMode(): boolean {
  return true;
}

/** Resolve logged-in user via NextAuth session. */
export async function getClientUser(): Promise<ClientUser | null> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { user?: { id?: string; email?: string; role?: string } };
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
