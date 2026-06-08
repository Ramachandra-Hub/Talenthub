'use client';

import Link from 'next/link';
import { use, useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Test, Question } from '@/lib/types';
import { TestProvider } from './test-context';
import TestInterface from './test-interface';
import { loadTestSections } from '@/lib/exam-v2/load-sections';
import type { TestSectionConfig } from '@/lib/exam-v2/section-timer';
import {
  getFallbackQuestionsByTestId,
  getFallbackTestById,
  getPsychometricQuestionsForTestId,
  isSchemaMissingError,
  PSYCHOMETRIC_FALLBACK_QUESTION_COUNT,
} from '@/lib/fallback-question-bank';
import {
  PRACTICE_PREVIEW_QUESTION_LIMIT,
  PSYCHOMETRIC_FULL_MINUTES,
  PSYCHOMETRIC_FULL_QUESTIONS,
  PSYCHOMETRIC_GUEST_MINUTES,
} from '@/lib/constants';
import { formatScorePercentLabel } from '@/lib/format-score';
import { isSignupDisabled } from '@/lib/auth-features';
import { defaultRedirectForRole } from '@/lib/roles';
import { useAppRole } from '@/lib/use-app-role';
import { ProctorConsentGate } from '@/components/proctor/proctor-consent-gate';
import { createProctorSessionId, saveTestProctorSessionId } from '@/lib/exam-v2/proctoring';
import { clearExamDraft } from '@/lib/exam-v2/autosave';
import { RmsetExamIntro } from '@/components/rmset/rmset-exam-intro';
import { isRmsetTestCategorySlug } from '@/lib/rmset/student-exam-intro';
import { getAttemptIndexForUser } from '@/lib/local-test-attempts';
import { sanitizeQuestionsForStudent } from '@/lib/questions/sanitize-for-student';
import { testIdsMatch, type CompletedAttemptSummary } from '@/lib/test-attempts';
import { getClientUser, isAwsClientMode } from '@/lib/client-auth';

/** `pending` = waiting on auth session; avoid starting the test until resolved. */
type PracticeAccessState = 'pending' | 'guest' | 'full';
export default function TakeTestPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const appRole = useAppRole();

  useEffect(() => {
    if (appRole === 'admin') {
      router.replace(defaultRedirectForRole(appRole));
    }
  }, [appRole, router]);
  const signupClosed = isSignupDisabled();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [testStarted, setTestStarted] = useState(false);
  const [proctorSessionId, setProctorSessionId] = useState('');
  const [practiceAccess, setPracticeAccess] = useState<PracticeAccessState>('pending');
  const [examSections, setExamSections] = useState<TestSectionConfig[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [priorAttempt, setPriorAttempt] = useState<CompletedAttemptSummary | null>(null);
  const [accessLocked, setAccessLocked] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (isAwsClientMode()) {
      setPracticeAccess('full');
    }
  }, []);

  useEffect(() => {
    const refreshAccess = async () => {
      try {
        const user = await getClientUser();
        setPracticeAccess(user ? 'full' : 'guest');
      } catch {
        setPracticeAccess('guest');
      }
    };

    void refreshAccess();

    const onWindowFocus = () => {
      void refreshAccess();
    };
    window.addEventListener('focus', onWindowFocus);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAccess();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const fetchTest = async () => {
      setLoadError(null);
      setAccessLocked(null);
      try {
        const user = await getClientUser();
        let detectedPrior: CompletedAttemptSummary | null = null;

        const policyRes = await fetch(`/api/tests/${encodeURIComponent(testId)}/access-policy`);
        if (policyRes.ok) {
          const policy = (await policyRes.json()) as {
            loginRequired?: boolean;
            liveExamTitle?: string | null;
          };
          if (policy.loginRequired && !user) {
            setAccessLocked(
              `Sign in with your roll number to take “${policy.liveExamTitle ?? 'this live examination'}”.`,
            );
            return;
          }
        }

        if (user) {
          const res = await fetch(`/api/student/tests/${encodeURIComponent(testId)}`, {
            credentials: 'include',
          });
          const json = (await res.json().catch(() => ({}))) as {
            test?: Test;
            questions?: Question[];
            sections?: TestSectionConfig[];
            error?: string;
            code?: string;
            locked?: boolean;
            alreadySubmitted?: boolean;
            priorAttempt?: CompletedAttemptSummary | null;
          };
          if (res.status === 403 && json.locked) {
            setAccessLocked(
              json.error ??
                'You are not authorized to take this examination. Contact the examination cell.',
            );
            return;
          }
          if (json.priorAttempt) {
            detectedPrior = json.priorAttempt;
          }
          if (json.test) {
            setTest(json.test);
          }
          if (json.alreadySubmitted && json.priorAttempt) {
            setPriorAttempt(json.priorAttempt);
            if (json.questions?.length) setQuestions(json.questions);
            if (json.sections?.length) setExamSections(json.sections);
            return;
          }
          if (res.ok && json.questions?.length) {
            setQuestions(json.questions);
            setExamSections(json.sections ?? []);
            return;
          }
          if (!res.ok && json.error) {
            setLoadError(json.error);
            if (json.test) return;
          }
        }

        if (isAwsClientMode()) {
          const fallbackTest = getFallbackTestById(testId);
          const fallbackQuestions = getFallbackQuestionsByTestId(testId);
          if (fallbackTest && fallbackQuestions.length > 0) {
            setTest(fallbackTest);
            setQuestions(sanitizeQuestionsForStudent(fallbackQuestions));
          } else if (!user) {
            setLoadError('Sign in with your roll number to take this exam.');
          } else {
            setLoadError('This exam could not be loaded. Ask faculty to republish it.');
          }
          return;
        }
      } catch (error) {
        if (isSchemaMissingError(error)) {
          const fallbackTest = getFallbackTestById(testId);
          const fallbackQuestions = getFallbackQuestionsByTestId(testId);
          if (fallbackTest && fallbackQuestions.length > 0) {
            setTest(fallbackTest);
            setQuestions(sanitizeQuestionsForStudent(fallbackQuestions));
            return;
          }
        }
        console.error('Error fetching test:', error);
        setLoadError(error instanceof Error ? error.message : 'Could not load test');
      } finally {
        setLoading(false);
      }
    };

    void fetchTest();
  }, [testId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading test...</p>
      </div>
    );
  }

  if (accessLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="p-8 text-center max-w-md border-amber-200 bg-amber-50/80">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2">
            Examination locked
          </p>
          <h1 className="text-lg font-semibold text-[#0c2340] mb-3">Access not permitted</h1>
          <p className="text-sm text-amber-950 mb-6">{accessLocked}</p>
          <p className="text-xs text-slate-600 mb-6">
            Live examinations require a signed-in student account in the correct department and year.
            Sharing the link does not grant access.
          </p>
          <Button asChild className="w-full">
            <Link href="/exams">Return to examinations</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <p className="text-muted-foreground mb-2">Test not found</p>
          {loadError ? (
            <p className="text-sm text-amber-800 mb-4">{loadError}</p>
          ) : null}
          <Button
            onClick={() => router.back()}
            className="w-full"
          >
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <p className="font-semibold text-foreground mb-2">{test.name}</p>
          <p className="text-muted-foreground mb-4">
            {loadError ?? 'No questions are available for this test yet.'}
          </p>
          <Button onClick={() => router.back()} className="w-full">
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  const shownQuestionCount =
    practiceAccess === 'full'
      ? PSYCHOMETRIC_FULL_QUESTIONS
      : practiceAccess === 'guest'
        ? PRACTICE_PREVIEW_QUESTION_LIMIT
        : null;
  const shownDurationMinutes =
    practiceAccess === 'full'
      ? PSYCHOMETRIC_FULL_MINUTES
      : practiceAccess === 'guest'
        ? PSYCHOMETRIC_GUEST_MINUTES
        : null;
  const runtimeTest =
    practiceAccess === 'full'
      ? { ...test, duration: test.duration, total_questions: test.total_questions ?? questions.length }
      : practiceAccess === 'guest'
        ? { ...test, duration: PSYCHOMETRIC_GUEST_MINUTES, total_questions: PRACTICE_PREVIEW_QUESTION_LIMIT }
        : { ...test, duration: test.duration, total_questions: test.total_questions };

  const beginProctoredExam = () => {
    void getClientUser().then((user) => {
      clearExamDraft(testId);
      window.sessionStorage.removeItem(`exam:start:${testId}`);
      window.sessionStorage.removeItem(`exam:serverStart:${testId}`);
      const sessionId = createProctorSessionId(testId, user?.id ?? undefined);
      saveTestProctorSessionId(testId, sessionId);
      setProctorSessionId(sessionId);
      setTestStarted(true);
    });
  };

  const isRmsetPaper =
    isRmsetTestCategorySlug(test.category_slug) || /\bRMSET\b/i.test(test.name ?? '');

  if (priorAttempt && practiceAccess === 'full') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-lg font-semibold text-[#0c2340] mb-2">{test.name}</h1>
          <p className="text-muted-foreground mb-2">
            You have already submitted this test. Each student may attempt it only once.
          </p>
          <p className="text-sm font-medium text-emerald-800 mb-6">
            Score: {formatScorePercentLabel(priorAttempt.score)}
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={`/tests/result/${priorAttempt.id}`}>View result</Link>
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              Go back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!testStarted) {
    if (practiceAccess === 'full') {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full border-border/90 p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
            <h1 className="text-2xl font-bold text-foreground mb-2">{test.name}</h1>

            {isRmsetPaper ? (
              <div className="mb-6">
                <RmsetExamIntro compact />
              </div>
            ) : null}

            <div className="space-y-4 mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Questions</span>
                <span className="font-semibold">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-semibold">{test.duration} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proctoring</span>
                <span className="font-semibold text-amber-700">Camera + tab monitoring</span>
              </div>
            </div>
            {test.description ? (
              <p className="text-sm text-muted-foreground mb-4">{test.description}</p>
            ) : null}
            <ProctorConsentGate onReady={beginProctoredExam} onCancel={() => router.back()} />
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card
          className={`w-full border-border/90 p-8 shadow-xl ${isRmsetPaper ? 'max-w-2xl max-h-[90vh] overflow-y-auto' : 'max-w-md'}`}
        >
          <h1 className="text-2xl font-bold text-foreground mb-4">{test.name}</h1>

          {isRmsetPaper ? (
            <div className="mb-6">
              <RmsetExamIntro compact />
            </div>
          ) : null}

          <div className="space-y-4 mb-6 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Questions:</span>
              <span className="font-semibold text-foreground">
                {shownQuestionCount == null ? '—' : shownQuestionCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-semibold text-foreground">
                {shownDurationMinutes == null ? '—' : `${shownDurationMinutes} minutes`}
              </span>
            </div>
          </div>

          {practiceAccess === 'pending' ? (
            <p className="mb-6 text-center text-sm text-muted-foreground">Checking sign-in status…</p>
          ) : null}

          {questions.length > PRACTICE_PREVIEW_QUESTION_LIMIT && practiceAccess === 'guest' ? (
            <div className="mb-6 rounded-lg border border-amber-400/50 bg-amber-500/20 p-4 text-sm text-amber-100">
              <p className="font-semibold text-amber-50">Free preview — first {PRACTICE_PREVIEW_QUESTION_LIMIT} questions</p>
              <p className="mt-2 text-foreground/95 leading-relaxed">
                Without an account you can only attempt <strong>{PRACTICE_PREVIEW_QUESTION_LIMIT}</strong> questions (
                this test has {questions.length} total).
                {signupClosed
                  ? ' Sign in with your student account to unlock every question and submit the full test.'
                  : ' Sign in or create an account to unlock every question and submit the full test.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                  onClick={() =>
                    router.push(`/auth/login?redirect=${encodeURIComponent(pathname ?? `/tests/take/${testId}`)}`)
                  }
                >
                  Sign in to unlock full test
                </Button>
                {!signupClosed ? (
                  <Button type="button" variant="outline" className="border-border bg-background/60" asChild>
                    <Link href={`/auth/signup?redirect=${encodeURIComponent(pathname ?? `/tests/take/${testId}`)}`}>
                      Create account
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mb-6 rounded-lg border border-border bg-muted/45 p-4">
            <p className="text-sm text-foreground leading-relaxed">
              <strong>Instructions:</strong>{' '}
              {test.question_time_limit_sec ? (
                <>
                  <span className="mb-2 block">
                    Each question runs on a short timer (about {test.question_time_limit_sec} seconds).
                    Use quick, instinctive answers — minimal reading. Time running out skips to the next item
                    (last item auto-finishes); you can still use Previous / Next.
                  </span>
                  {test.description ? (
                    <span className="mt-2 block text-muted-foreground">{test.description}</span>
                  ) : null}
                </>
              ) : (
                test.description ||
                'Answer all questions within the given time limit. You can review your answers before submission.'
              )}
            </p>
          </div>

          <Button
            onClick={() => setTestStarted(true)}
            disabled={practiceAccess === 'pending'}
            className="w-full mb-2"
          >
            {practiceAccess === 'pending' ? 'Checking account…' : 'Start preview'}
          </Button>
          <Button onClick={() => router.back()} variant="outline" className="w-full">
            Cancel
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <TestProvider>
      <TestInterface
        test={runtimeTest}
        questions={questions}
        fullAccess={practiceAccess === 'full'}
        examSections={examSections}
        proctorEnabled={practiceAccess === 'full'}
        proctorSessionId={proctorSessionId}
      />
    </TestProvider>
  );
}
