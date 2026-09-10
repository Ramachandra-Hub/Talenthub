'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthCard } from '@/components/auth/auth-card';
import {
  FormField,
  portalInputClass,
  portalSelectContentClass,
  portalSelectItemClass,
  portalSelectTriggerClass,
} from '@/components/auth/form-field';
import { ACADEMIC_YEARS, COLLEGE, DEPARTMENTS } from '@/lib/college-brand';
import { validatePassword, validateRollNumber } from '@/lib/college-auth';
import { StatusAlert } from '@/components/ui/status-alert';

export default function OpenExamJoinPage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token ?? '');

  const [title, setTitle] = useState('Open exam');
  const [duration, setDuration] = useState<number | null>(null);
  const [kind, setKind] = useState<'exam' | 'dsa_hard_open'>('exam');
  const [yearRestriction, setYearRestriction] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/exams/open/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        title?: string;
        duration?: number;
        requiresPassword?: boolean;
        kind?: 'exam' | 'dsa_hard_open';
        yearRestriction?: string | null;
      };
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(json.error ?? 'This exam link is invalid or expired.');
        return;
      }
      setTitle(json.title ?? 'Open exam');
      setDuration(json.duration ?? null);
      setKind(json.kind === 'dsa_hard_open' ? 'dsa_hard_open' : 'exam');
      setYearRestriction(json.yearRestriction ?? null);
      if (json.yearRestriction === 'IV Year' || json.kind === 'dsa_hard_open') {
        setYear('IV Year');
      }
    })().catch(() => {
      if (!cancelled) setLoadError('Could not load this exam link.');
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    const rollErr = validateRollNumber(rollNumber);
    const passErr = validatePassword(password);
    if (rollErr) errs.rollNumber = rollErr;
    if (passErr) errs.password = passErr;
    if (!branch) errs.branch = 'Select your department';
    if (!year) errs.year = 'Select your year';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/exams/open/${encodeURIComponent(token)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rollNumber: rollNumber.trim(),
          password,
          branch,
          year,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        takeUrl?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Could not join the exam.');
      window.location.assign(json.takeUrl && json.takeUrl.startsWith('/') ? json.takeUrl : '/exams');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the exam.');
    } finally {
      setLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="portal-auth min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4">
        <StatusAlert variant="error">{loadError}</StatusAlert>
      </div>
    );
  }

  return (
    <div className="portal-auth relative min-h-[calc(100dvh-4rem)] text-[#0c2340] px-4 py-10">
      <div className="relative z-10 mx-auto w-full max-w-lg">
        <AuthCard
          title={title}
          description={
            kind === 'dsa_hard_open'
              ? `${COLLEGE.rce} hard coding open link. IV Year students only — sign in with roll number, exam password, and department.`
              : `${COLLEGE.rce} open exam link. Sign in with your roll number, the default password, branch, and year.`
          }
        >
          <form onSubmit={onSubmit} className="space-y-5">
            {duration ? (
              <p className="text-sm text-slate-600">Duration: {duration} minutes</p>
            ) : null}
            {kind === 'dsa_hard_open' ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Hard coding exam · 5 Java/Python problems from the campus coding bank · IV Year
                (4th year) only.
              </p>
            ) : null}
            {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}

            <FormField
              id="rollNumber"
              label="Roll number / registration number"
              error={fieldErrors.rollNumber}
            >
              <Input
                id="rollNumber"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 21CS001"
                className={portalInputClass}
                autoComplete="username"
                required
              />
            </FormField>

            <FormField
              id="password"
              label="Password"
              hint={
                kind === 'dsa_hard_open'
                  ? 'Use the open-link exam password from faculty (or your student login password if you already have an account).'
                  : 'New students: use the exam password from faculty. Returning students: exam password or your student login password.'
              }
              error={fieldErrors.password}
            >
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={portalInputClass}
                autoComplete="current-password"
                required
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Department / branch" error={fieldErrors.branch}>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className={portalSelectTriggerClass}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent className={portalSelectContentClass}>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d} className={portalSelectItemClass}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Academic year"
                error={fieldErrors.year}
                hint={yearRestriction === 'IV Year' ? 'Locked to IV Year for this coding open link.' : undefined}
              >
                <Select
                  value={year}
                  onValueChange={setYear}
                  disabled={yearRestriction === 'IV Year'}
                >
                  <SelectTrigger className={portalSelectTriggerClass}>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent className={portalSelectContentClass}>
                    {(yearRestriction === 'IV Year' ? (['IV Year'] as const) : ACADEMIC_YEARS).map(
                      (y) => (
                        <SelectItem key={y} value={y} className={portalSelectItemClass}>
                          {y}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#16304f] text-white"
            >
              {loading
                ? 'Joining exam…'
                : kind === 'dsa_hard_open'
                  ? 'Open coding lab →'
                  : 'Open exam →'}
            </Button>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
