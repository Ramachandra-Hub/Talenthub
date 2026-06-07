'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PortalShell } from '@/components/auth/portal-shell';
import { AuthCard } from '@/components/auth/auth-card';
import {
  adminAuthEmail,
  validateAdminUsername,
  validateAdminPassword,
} from '@/lib/college-auth';
import { StatusAlert } from '@/components/ui/status-alert';
import { joinApiErrorParts } from '@/lib/api-error-message';
import { DEFAULT_ADMIN_EMAIL } from '@/lib/admin-defaults';

function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const verifyAdmin = async () => {
    const verifyRes = await fetch('/api/admin/verify', {
      method: 'POST',
      credentials: 'include',
    });
    const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
      isAdmin?: boolean;
      error?: string;
    };

    if (verifyRes.ok && verifyJson.isAdmin) {
      router.push('/admin/dashboard');
      return;
    }

    throw new Error(
      verifyJson.error ??
        'This account does not have admin access. Contact the examination cell.',
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    const userErr = validateAdminUsername(username);
    const passErr = validateAdminPassword(password);
    if (userErr) errs.username = userErr;
    if (passErr) errs.password = passErr;
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const trimmed = username.trim();
      const email = trimmed.includes('@') ? trimmed.toLowerCase() : adminAuthEmail(trimmed);
      if (!trimmed.includes('@')) {
        throw new Error(
          `Enter your full admin email (e.g. ${DEFAULT_ADMIN_EMAIL}).`,
        );
      }

      const signInRes = await fetch('/api/auth/admin/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: password.trim() }),
      });
      const signInJson = (await signInRes.json().catch(() => ({}))) as {
        error?: unknown;
        hint?: string;
      };
      if (!signInRes.ok) {
        throw new Error(
          joinApiErrorParts(signInJson, 'Invalid email or password.'),
        );
      }

      await verifyAdmin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalShell showBackToRoles>
      <AuthCard
        title="Admin Sign In"
        description="Examination cell and system administrators."
      >
        <form onSubmit={onSubmit} className="space-y-4 text-left">
          {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
              Admin email
            </label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={DEFAULT_ADMIN_EMAIL}
              className="bg-white border-slate-300"
              autoComplete="username"
              required
            />
            {fieldErrors.username ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white border-slate-300"
              autoComplete="current-password"
              required
            />
            {fieldErrors.password ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1e3a5f] hover:bg-[#16304f] text-white"
          >
            {loading ? 'Signing in…' : 'Sign in to admin panel'}
          </Button>
        </form>
      </AuthCard>
    </PortalShell>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-auth min-h-screen flex items-center justify-center text-slate-700 font-medium">
          Loading…
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
