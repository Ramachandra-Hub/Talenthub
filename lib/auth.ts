/**
 * Client-side auth helpers — AWS RDS + NextAuth only.
 */
export async function signUp(email: string, password: string, fullName: string) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, fullName }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; user?: { id: string } };
  if (!res.ok) throw new Error(json.error ?? 'Sign up failed');
  if (!json.user?.id) throw new Error('User creation failed');
  return json.user;
}

export async function signIn(email: string, password: string) {
  const res = await fetch('/api/student/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; user?: { id: string } };
  if (!res.ok) throw new Error(json.error ?? 'Sign in failed');
  return json.user;
}

export async function sendPasswordResetEmail(_email: string) {
  throw new Error('Password reset is managed by the placement cell. Contact admin.');
}

export async function resetPassword(_newPassword: string) {
  throw new Error('Password reset is managed by the placement cell. Contact admin.');
}

export async function isAdmin(userId: string) {
  const res = await fetch('/api/admin/me', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) return false;
  const raw = await res.text();
  if (!raw.trim()) return false;
  try {
    const json = JSON.parse(raw) as { isAdmin?: boolean; userId?: string };
    return !!json.isAdmin && json.userId === userId;
  } catch {
    return false;
  }
}
