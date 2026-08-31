'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CodeEditor } from '@/components/coding/code-editor';
import { getClientUser } from '@/lib/client-auth';
import { CODING_LANGUAGES, isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';
import { runCodingOnServer } from '@/lib/coding/run-client';

type Mcq = {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  selected: string | null;
  isCorrect: boolean | null;
  explanation: string | null;
};

type Problem = {
  id: string;
  title: string;
  statement: string;
  constraints: string | null;
  inputFormat: string;
  outputFormat: string;
  examples: unknown;
  difficulty: string;
  conceptSlug: string;
  languages: unknown;
  starterCode: unknown;
  sampleTests: Array<{ input: string; expectedOutput: string }>;
  hiddenTestCount: number;
  best: { passed: number; total: number; scorePercent: number; status: string; language: string } | null;
};

type DayPayload = {
  locked?: boolean;
  lockReason?: string;
  status?: string;
  kind?: string;
  week?: { id: string; title: string; topicName: string };
  day?: { id: string; dayNumber: number; title: string };
  config?: {
    supportedLanguages: string[];
    defaultLanguage: string;
    dayCompletion: { minCodingSolved: number; minMcqAttempted: number; minMcqPercent: number };
  };
  problems?: Problem[];
  mcqs?: Mcq[];
  error?: string;
};

function starterFor(problem: Problem, language: CodingLanguageId): string {
  const map = problem.starterCode && typeof problem.starterCode === 'object'
    ? (problem.starterCode as Record<string, string>)
    : {};
  return map[language] ?? '';
}

export function DsaDayView({ dayId }: { dayId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const kind = search.get('kind') === 'practice' ? 'practice' : 'official';
  const [data, setData] = useState<DayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<CodingLanguageId>('java');
  const [code, setCode] = useState('');
  const [activeProblem, setActiveProblem] = useState<string | null>(null);
  const [runOut, setRunOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/student/dsa/days/${dayId}?kind=${kind}`, { credentials: 'include' });
    const json = (await res.json()) as DayPayload;
    if (!res.ok) {
      setError(json.error ?? 'Could not load day');
      setData(json);
      return;
    }
    setData(json);
    setError(null);
    const first = json.problems?.[0];
    if (first) {
      setActiveProblem(first.id);
      const langs = json.config?.supportedLanguages?.filter(isCodingLanguageId) ?? ['java'];
      const def = isCodingLanguageId(json.config?.defaultLanguage ?? '')
        ? (json.config!.defaultLanguage as CodingLanguageId)
        : langs[0];
      setLanguage(def);
      setCode(starterFor(first, def));
    }
  }, [dayId, kind]);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        await load();
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [load, router]);

  const problem = useMemo(
    () => data?.problems?.find((p) => p.id === activeProblem) ?? data?.problems?.[0] ?? null,
    [data, activeProblem],
  );

  const languages = (data?.config?.supportedLanguages ?? []).filter(isCodingLanguageId);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (data?.locked) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card className="p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {data.week?.title} · {data.day?.title}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#0c2340]">🔒 Locked</h1>
          <p className="mt-3 text-sm text-slate-700">{data.lockReason}</p>
          <Button className="mt-4" variant="outline" asChild>
            <Link href="/dsa">Back to DSA dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (error && !data?.day) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card className="p-6">
          <p className="font-semibold">Could not open this day</p>
          <p className="text-sm text-slate-600 mt-2">{error}</p>
          <Button className="mt-4" asChild>
            <Link href="/dsa">Back</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const submitMcq = async (mcqId: string, selected: string) => {
    setBusy(`mcq-${mcqId}`);
    try {
      const res = await fetch('/api/student/dsa/mcq', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcqId, selected }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(json.error ?? 'Could not save answer');
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const runSample = async () => {
    if (!problem) return;
    setBusy('run');
    setRunOut('Running sample…');
    try {
      const sample = problem.sampleTests[0];
      const result = await runCodingOnServer(language, code, sample?.input ?? '');
      setRunOut(
        [result.stderr, result.stdout, result.error].filter(Boolean).join('\n') ||
          `(exit ${result.exitCode ?? '?'})`,
      );
    } catch (err) {
      setRunOut(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setBusy(null);
    }
  };

  const submitCode = async () => {
    if (!problem) return;
    setBusy('submit');
    try {
      const res = await fetch('/api/student/dsa/code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: problem.id, language, sourceCode: code }),
      });
      const json = (await res.json()) as {
        error?: string;
        passed?: number;
        total?: number;
        status?: string;
      };
      if (!res.ok) {
        alert(json.error ?? 'Submit failed');
        return;
      }
      alert(`Official result: ${json.passed}/${json.total} tests · ${json.status}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const completeDay = async () => {
    setBusy('complete');
    try {
      const res = await fetch(`/api/student/dsa/days/${dayId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = (await res.json()) as {
        ok?: boolean;
        reasons?: string[];
        nextDayNumber?: number | null;
        error?: string;
      };
      if (!res.ok) {
        alert(json.error ?? 'Could not complete day');
        return;
      }
      if (!json.ok) {
        alert((json.reasons ?? ['Requirements not met']).join('\n'));
        return;
      }
      if (json.nextDayNumber) {
        alert(`Day complete. Day ${json.nextDayNumber} is now available.`);
      } else {
        alert('All days complete. Take the weekly assessment from the dashboard.');
      }
      router.push('/dsa');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap justify-between gap-2">
        <Link href="/dsa" className="text-sm font-semibold text-[#1e3a5f] hover:underline">
          ← DSA dashboard
        </Link>
        {kind === 'practice' ? <Badge tone="warning">Practice (does not change qualification)</Badge> : null}
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {data?.week?.title} · {data?.week?.topicName}
        </p>
        <h1 className="text-2xl font-bold text-[#0c2340]">{data?.day?.title}</h1>
        <p className="text-sm text-slate-600 mt-1">
          Status: {data?.status?.replace('_', ' ')}. Solve the assigned coding problem and MCQs, then
          mark the day complete. The server checks the rules — the next day stays locked until you pass.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-[#0c2340]">Concept MCQs</h2>
        {!data?.mcqs?.length ? (
          <p className="text-sm text-slate-500 mt-2">No MCQs assigned for this day.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {data.mcqs.map((mcq, idx) => (
              <li key={mcq.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-[#0c2340]">
                  {idx + 1}. {mcq.questionText}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(['A', 'B', 'C', 'D'] as const).map((key) => {
                    const label =
                      key === 'A'
                        ? mcq.optionA
                        : key === 'B'
                          ? mcq.optionB
                          : key === 'C'
                            ? mcq.optionC
                            : mcq.optionD;
                    return (
                    <Button
                      key={key}
                      variant={mcq.selected === key ? 'default' : 'outline'}
                      size="sm"
                      disabled={busy === `mcq-${mcq.id}`}
                      onClick={() => void submitMcq(mcq.id, key)}
                    >
                      {key}. {label}
                    </Button>
                    );
                  })}
                </div>
                {mcq.isCorrect != null ? (
                  <p className={`text-sm mt-2 ${mcq.isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
                    {mcq.isCorrect ? 'Correct.' : 'Incorrect.'} {mcq.explanation}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-[#0c2340]">Coding problem</h2>
          {problem?.best ? (
            <Badge tone={problem.best.status === 'passed' ? 'success' : 'warning'}>
              Best: {problem.best.passed}/{problem.best.total} ({problem.best.language})
            </Badge>
          ) : null}
        </div>
        {!problem ? (
          <p className="text-sm text-slate-500">No coding problem assigned.</p>
        ) : (
          <>
            <h3 className="text-lg font-bold text-[#0c2340]">{problem.title}</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{problem.statement}</p>
            <p className="text-xs text-slate-500">
              Concept: {problem.conceptSlug} · Difficulty: {problem.difficulty} · Hidden tests:{' '}
              {problem.hiddenTestCount}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Input:</strong> {problem.inputFormat}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Output:</strong> {problem.outputFormat}
            </p>
            {problem.constraints ? (
              <p className="text-sm text-slate-600">
                <strong>Constraints:</strong> {problem.constraints}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs font-semibold uppercase text-slate-500">Language</label>
              <select
                className="rounded-lg border px-3 py-2 text-sm"
                value={language}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!isCodingLanguageId(next)) return;
                  setLanguage(next);
                  setCode(starterFor(problem, next));
                }}
              >
                {(languages.length ? languages : CODING_LANGUAGES.map((l) => l.id)).map((id) => (
                  <option key={id} value={id}>
                    {CODING_LANGUAGES.find((l) => l.id === id)?.label ?? id}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Same DSA problem in every language. Changing language does not reset your day.
              </p>
            </div>
            <CodeEditor language={language} value={code} onChange={setCode} height="320px" />
            {runOut ? (
              <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto max-h-40">
                {runOut}
              </pre>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy != null} onClick={() => void runSample()}>
                Run sample
              </Button>
              <Button disabled={busy != null} onClick={() => void submitCode()}>
                Submit for grading
              </Button>
            </div>
          </>
        )}
      </Card>

      <Button disabled={busy != null} onClick={() => void completeDay()}>
        Check day completion
      </Button>
    </div>
  );
}
