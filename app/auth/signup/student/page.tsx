'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PortalShell } from '@/components/auth/portal-shell';
import { AuthCard } from '@/components/auth/auth-card';
import {
  FormField,
  portalInputClass,
  portalSelectContentClass,
  portalSelectItemClass,
  portalSelectTriggerClass,
} from '@/components/auth/form-field';
import { ACADEMIC_YEARS, DEPARTMENTS } from '@/lib/college-brand';
import {
  studentAuthEmail,
  validatePassword,
  validateRollNumber,
} from '@/lib/college-auth';
import { collegeEmailDomainHint } from '@/lib/college-signup';
import { useCollegeSignUp } from '@/components/auth/use-college-sign-up';
import { isClientAuthConfigured } from '@/lib/client-auth';

function StudentSignupForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const postSignup =
    redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/home';

  const { signUp, loading, error, setError } = useCollegeSignUp();
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const signupQuery = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required';
    const rollErr = validateRollNumber(rollNumber);
    const passErr = validatePassword(password);
    if (rollErr) errs.rollNumber = rollErr;
    if (passErr) errs.password = passErr;
    if (!department) errs.department = 'Select your department';
    if (!year) errs.year = 'Select your year';
    if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    if (!isClientAuthConfigured()) {
      setError('Configure AUTH_SECRET and DATABASE_URL');
      return;
    }

    const email = studentAuthEmail(rollNumber);
    await signUp({
      email,
      password,
      fullName: fullName.trim(),
      role: 'student',
      redirectTo: postSignup,
      metadata: {
        roll_number: rollNumber.trim(),
        department,
        year,
        full_name: fullName.trim(),
      },
    });
  };

  return (
    <PortalShell showBackToRoles backHref="/auth/signup" backLabel="← Back to registration">
      <AuthCard
        title="Student Registration"
        description={`Create your portal account. Login email will use @${collegeEmailDomainHint('student')}.`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <p className="text-sm font-medium text-red-950 bg-red-50 border border-red-200 rounded-lg px-4 py-3" role="alert">
              {error}
            </p>
          ) : null}

          <FormField id="fullName" label="Full name" error={fieldErrors.fullName}>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="As on college records"
              className={portalInputClass}
              required
            />
          </FormField>

          <FormField
            id="rollNumber"
            label="Roll number / Registration number"
            hint="Used for sign-in (e.g. 21CS001)"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Department" error={fieldErrors.department}>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className={portalSelectTriggerClass}>
                  <SelectValue placeholder="Department" />
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

            <FormField label="Year" error={fieldErrors.year}>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className={portalSelectTriggerClass}>
                  <SelectValue placeholder="Year" />
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

          <FormField id="password" label="Password" error={fieldErrors.password}>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className={portalInputClass}
              autoComplete="new-password"
              required
            />
          </FormField>

          <FormField id="confirmPassword" label="Confirm password" error={fieldErrors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={portalInputClass}
              autoComplete="new-password"
              required
            />
          </FormField>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#1e3a5f] hover:bg-[#16304f] text-white font-semibold"
          >
            {loading ? 'Creating account…' : 'Create student account'}
          </Button>

          <p className="text-center text-sm text-slate-700">
            Already registered?{' '}
            <Link href={`/auth/login/student${signupQuery}`} className="font-semibold text-[#1e3a5f] hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </AuthCard>
    </PortalShell>
  );
}

export default function StudentSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-auth min-h-screen flex items-center justify-center text-slate-800 font-medium">
          Loading…
        </div>
      }
    >
      <StudentSignupForm />
    </Suspense>
  );
}
