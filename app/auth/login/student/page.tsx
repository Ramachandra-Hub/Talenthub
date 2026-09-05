'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthCard } from '@/components/auth/auth-card';
import { StudentLoginIntro } from '@/components/auth/student-login-intro';
import {
  FormField,
  portalInputClass,
  portalSelectContentClass,
  portalSelectItemClass,
  portalSelectTriggerClass,
} from '@/components/auth/form-field';
import { ACADEMIC_YEARS, COLLEGE, DEPARTMENTS } from '@/lib/college-brand';
import { validatePassword, validateRollNumber } from '@/lib/college-auth';
import { useStudentSignIn } from '@/components/auth/use-student-sign-in';
import { isSignupDisabled } from '@/lib/auth-features';
import { StatusAlert } from '@/components/ui/status-alert';

const REMEMBER_KEY = 'rce_student_remember';

function StudentLoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const notice = searchParams.get('notice');
  const postLogin =
    redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/home';

  const signupOpen = !isSignupDisabled();
  const signupHref = redirect
    ? `/auth/signup/student?redirect=${encodeURIComponent(redirect)}`
    : '/auth/signup/student';

  const { signIn, loading, error, setError } = useStudentSignIn();
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        if (/^elevatex_cfg:/i.test(saved.trim())) {
          localStorage.removeItem(REMEMBER_KEY);
          return;
        }
        setRollNumber(saved);
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    const rollErr = validateRollNumber(rollNumber);
    const passErr = validatePassword(password);
    if (rollErr) errs.rollNumber = rollErr;
    if (passErr) errs.password = passErr;
    if (!department) errs.department = 'Select your department';
    if (!year) errs.year = 'Select your year';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    if (remember) {
      localStorage.setItem(REMEMBER_KEY, rollNumber.trim());
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    await signIn({
      rollNumber: rollNumber.trim(),
      password,
      department,
      year,
      redirectTo: postLogin,
    });
  };

  return (
    <div className="portal-auth relative min-h-[calc(100dvh-4rem)] text-[#0c2340] px-4 py-8 sm:py-10">
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,28rem)] gap-8 xl:gap-14 items-start">
          <div className="hidden lg:block pt-2">
            <StudentLoginIntro />
          </div>

          <div className="w-full lg:max-w-none mx-auto max-w-lg">
            <div className="lg:hidden mb-5">
              <StudentLoginIntro compact />
            </div>

            <AuthCard
              title="Student sign in"
              description={`Enter your ${COLLEGE.rce} credentials to access live examinations and your assigned slot. If sign-in fails, press Ctrl+F5, then try again.`}
            >
              <form onSubmit={onSubmit} className="space-y-5">
                {notice === 'signup_closed' ? (
                  <StatusAlert variant="info">
                    New registrations are closed. Sign in with credentials issued by your department.
                  </StatusAlert>
                ) : null}

                {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-4 py-3.5">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1e3a5f]">
                    Step 1 · Identity
                  </p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Use the roll / registration number printed on your college ID and the password
                    provided by the examination cell.
                  </p>
                </div>

                <FormField
                  id="rollNumber"
                  label="Roll number / registration number"
                  hint="Example format: 21CS001 — must match your roster entry exactly"
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
                  label="Examination password"
                  hint="Issued by Training & Placement or your department — not your email password"
                  error={fieldErrors.password}
                >
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={portalInputClass}
                    autoComplete="current-password"
                    required
                  />
                </FormField>

                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/95 to-white p-4 sm:p-5 space-y-4 shadow-inner shadow-slate-900/[0.02]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1e3a5f]">
                      Step 2 · Academic profile
                    </p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      These must match your college records so the correct examination roster and
                      slot are applied to your account.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    <FormField label="Department / branch" error={fieldErrors.department}>
                      <Select value={department} onValueChange={setDepartment}>
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
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-0.5">
                  <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800 cursor-pointer select-none">
                    <Checkbox
                      checked={remember}
                      onCheckedChange={(v) => setRemember(v === true)}
                      className="border-slate-400 data-[state=checked]:bg-[#1e3a5f] data-[state=checked]:border-[#1e3a5f]"
                    />
                    Remember roll number on this device
                  </label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-semibold text-[#1e4a7a] hover:text-[#1e3a5f] hover:underline text-center sm:text-right"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#16304f] hover:from-[#16304f] hover:to-[#0f2844] text-white shadow-lg shadow-[#1e3a5f]/20 transition-all"
                >
                  {loading ? 'Signing in…' : 'Continue to examinations →'}
                </Button>

                {signupOpen ? (
                  <p className="text-center text-sm text-slate-700 pt-1 border-t border-slate-100">
                    First-time student?{' '}
                    <Link href={signupHref} className="font-semibold text-[#1e3a5f] hover:underline">
                      Create your portal account
                    </Link>
                  </p>
                ) : null}
              </form>
            </AuthCard>

            <p className="mt-6 text-center text-sm">
              <Link href="/auth/role" className="text-[#1e3a5f] hover:underline font-semibold">
                ← Change role
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-auth min-h-screen flex items-center justify-center text-slate-800 font-medium">
          Loading…
        </div>
      }
    >
      <StudentLoginForm />
    </Suspense>
  );
}
