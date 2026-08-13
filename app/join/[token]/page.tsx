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
import { DEFAULT_EXAM_STUDENT_PASSWORD } from '@/lib/roster-credentials-export';
import { StatusAlert } from '@/components/ui/status-alert';

export default function OpenExamJoinPage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token ?? '');

  const [title, setTitle] = useState('Open exam');
  const [duration, setDuration] = useState<number | null>(null);
  const [defaultPassword, setDefaultPassword] = useState(DEFAULT_EXAM_STUDENT_PASSWORD);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState(DEFAULT_EXAM_STUDENT_PASSWORD);
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
        defaultPasswordHint?: string;
      };
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(json.error ?? 'This exam link is invalid or expired.');
        return;
      }
      setTitle(json.title ?? 'Open exam');
      setDuration(json.duration ?? null);
      if (json.defaultPasswordHint) {
        setDefaultPassword(json.defaultPasswordHint);
        setPassword(json.defaultPasswordHint);
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
          description={`${COLLEGE.rce} open exam link. Sign in with your roll number, the default password, branch, and year.`}
        >
          <form onSubmit={onSubmit} className="space-y-5">
            {duration ? (
              <p className="text-sm text-slate-600">Duration: {duration} minutes</p>
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
              label="Default exam password"
              hint={`Use ${defaultPassword} unless your department issued a different password.`}
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
              <FormField label="Academic year" error={fieldErrors.year}>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className={portalSelectTriggerClass}>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent className={portalSelectContentClass}>
                    {ACADEMIC_YEARS.map((y) => (
                      <SelectItem key={y} value={y} className={portalSelectItemClass}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#16304f] text-white"
            >
              {loading ? 'Joining exam…' : 'Open exam →'}
            </Button>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
