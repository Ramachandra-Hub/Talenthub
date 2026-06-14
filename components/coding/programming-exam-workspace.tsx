'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, Play, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/coding/code-editor';
import {
  CODING_LANGUAGES,
  getCodingLanguage,
  isCodingLanguageId,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import { effectiveSourceCode } from '@/lib/coding/effective-source';
import {
  PROGRAMMING_SAMPLE_PROBLEMS,
  outputsMatch,
  type ProgrammingProblem,
} from '@/lib/coding/sample-problems';
import { pickBestLanguageForProblem } from '@/lib/coding/grade-helpers';
import {
  clearExamTimer,
  formatExamTimer,
  PROGRAMMING_EXAM_DURATION_SECONDS,
  readExamEndAt,
  secondsRemaining,
  startExamTimer,
} from '@/lib/coding/programming-exam';
import {
  PROGRAMMING_DASHBOARD_TEST_ID,
  PROGRAMMING_DASHBOARD_TEST_NAME,
} from '@/lib/programming-dashboard';
import { recordDashboardAttempt } from '@/lib/record-dashboard-attempt';
import { formatCodingRunOutput, runCodingOnServer } from '@/lib/coding/run-client';
import { cn } from '@/lib/utils';

type ConsoleTab = 'input' | 'output';

function codeStorageKey(problemId: string, langId: CodingLanguageId): string {
  return `${problemId}:${langId}`;
}

function buildInitialCodeStore(): Record<string, string> {
  const init: Record<string, string> = {};
  for (const p of PROGRAMMING_SAMPLE_PROBLEMS) {
    for (const l of CODING_LANGUAGES) {
      init[codeStorageKey(p.id, l.id)] = l.stub;
    }
  }
  return init;
}

async function runOnServer(language: CodingLanguageId, sourceCode: string, stdin: string) {
  return runCodingOnServer(language, sourceCode, stdin);
}

export function ProgrammingExamWorkspace() {
  const [phase, setPhase] = useState<'intro' | 'active' | 'ended'>('intro');
  const [endAt, setEndAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(PROGRAMMING_EXAM_DURATION_SECONDS);
  const [problemIndex, setProblemIndex] = useState(0);
  const [language, setLanguage] = useState<CodingLanguageId>('python');
  const [codeStore, setCodeStore] = useState<Record<string, string>>(buildInitialCodeStore);
  const [customInput, setCustomInput] = useState('');
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('output');
  const [output, setOutput] = useState('');
  const [meta, setMeta] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const endedRef = useRef(false);

  const problem = PROGRAMMING_SAMPLE_PROBLEMS[problemIndex];
  const storageKey = codeStorageKey(problem.id, language);
  const code = effectiveSourceCode(codeStore[storageKey], language);

  const setCode = (value: string) => {
    if (!value.trim() && !codeStore[storageKey]?.trim()) return;
    setCodeStore((prev) => ({ ...prev, [storageKey]: value }));
  };

  useEffect(() => {
    const existing = readExamEndAt();
    if (existing && existing > Date.now()) {
      setEndAt(existing);
      setPhase('active');
    }
  }, []);

  useEffect(() => {
    setCustomInput(problem.sampleInput);
    setOutput('');
    setMeta('');
    setConsoleTab('input');
  }, [problem.id, problem.sampleInput]);

  const onLanguageChange = (value: string) => {
    if (!isCodingLanguageId(value)) return;
    setLanguage(value);
  };

  const handleStart = () => {
    const end = startExamTimer();
    setEndAt(end);
    setTimeLeft(PROGRAMMING_EXAM_DURATION_SECONDS);
    setPhase('active');
    endedRef.current = false;
    setLocked(false);
  };

  const handleRun = async (stdin: string) => {
    if (locked) return;
    setRunning(true);
    setConsoleTab('output');
    setOutput('Running…');
    setMeta('');
    try {
      const data = await runOnServer(language, code, stdin);
      setMeta(
        [
          data.engine && `Engine: ${data.engine}`,
          data.runtimeMs !== undefined && `${data.runtimeMs}ms`,
          data.exitCode !== undefined && `exit ${data.exitCode}`,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      setOutput(formatCodingRunOutput(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Run failed. Sign in and try again.');
    } finally {
      setRunning(false);
    }
  };

  const gradeProblem = async (p: ProgrammingProblem, source: string, lang: CodingLanguageId) => {
    const details: string[] = [];
    try {
      const data = await runOnServer(lang, source, p.sampleInput);
      const out = (data.stdout ?? '').trim();
      const pass = (data.exitCode === undefined || data.exitCode === 0) && outputsMatch(out, p.sampleOutput);
      details.push(
        pass
          ? `✓ sample case passed`
          : `✗ expected "${p.sampleOutput.trim()}", got "${out || '(empty)'}"`,
      );
      return { passed: pass ? 1 : 0, total: 1, details };
    } catch {
      details.push('✗ run error — check you are logged in');
      return { passed: 0, total: 1, details };
    }
  };

  const buildProgrammingAnswers = useCallback((): Record<string, { userAnswer: string }> => {
    const answers: Record<string, { userAnswer: string }> = {};
    for (const p of PROGRAMMING_SAMPLE_PROBLEMS) {
      const sourcesByLang: Record<string, string> = {};
      for (const l of CODING_LANGUAGES) {
        const key = codeStorageKey(p.id, l.id);
        if (codeStore[key]?.trim()) sourcesByLang[l.id] = codeStore[key];
      }
      answers[p.id] = { userAnswer: JSON.stringify(sourcesByLang) };
    }
    return answers;
  }, [codeStore]);

  const gradeAllProblems = useCallback(async () => {
    const results = await Promise.all(
      PROGRAMMING_SAMPLE_PROBLEMS.map(async (p) => {
        const sourcesByLang: Record<CodingLanguageId, string | undefined> = {} as Record<
          CodingLanguageId,
          string | undefined
        >;
        for (const l of CODING_LANGUAGES) {
          sourcesByLang[l.id] = codeStore[codeStorageKey(p.id, l.id)];
        }
        const gradingLang = pickBestLanguageForProblem(sourcesByLang, language);
        const src = effectiveSourceCode(sourcesByLang[gradingLang], gradingLang);
        const result = await gradeProblem(p, src, gradingLang);
        return { problem: p, gradingLang, result };
      }),
    );

    let passed = 0;
    let total = 0;
    const lines: string[] = [];
    for (const row of results) {
      passed += row.result.passed;
      total += row.result.total;
      lines.push(
        `${row.problem.title}: ${row.result.passed}/${row.result.total} cases passed (${row.gradingLang})`,
      );
    }
    const scorePercent = total > 0 ? (passed / total) * 100 : 0;
    return { passed, total, scorePercent, lines, answers: buildProgrammingAnswers() };
  }, [buildProgrammingAnswers, codeStore, language]);

  const persistProgrammingResult = useCallback(
    async (
      scorePercent: number,
      elapsedSec: number,
      answers?: Record<string, { userAnswer: string }>,
    ) => {
      return recordDashboardAttempt({
        testId: PROGRAMMING_DASHBOARD_TEST_ID,
        testName: PROGRAMMING_DASHBOARD_TEST_NAME,
        scorePercent,
        rawNetScore: scorePercent,
        elapsedSec,
        examKind: 'programming',
        answers,
        test: {
          id: PROGRAMMING_DASHBOARD_TEST_ID,
          name: PROGRAMMING_DASHBOARD_TEST_NAME,
          category_id: 'programming',
          duration: PROGRAMMING_EXAM_DURATION_SECONDS / 60,
          total_questions: PROGRAMMING_SAMPLE_PROBLEMS.length,
        },
      });
    },
    [],
  );

  const finishExam = useCallback(
    (
      reason: 'timeout' | 'submit',
      summary?: {
        lines: string[];
        scorePercent: number;
        answers?: Record<string, { userAnswer: string }>;
      },
    ) => {
      if (endedRef.current) return;
      endedRef.current = true;
      setLocked(true);
      setPhase('ended');
      clearExamTimer();
      const msg =
        reason === 'timeout'
          ? 'Time is up. Your programming test session has ended.'
          : 'You submitted the programming test.';
      if (summary?.lines.length) {
        setOutput(summary.lines.join('\n'));
      } else {
        setOutput(msg);
      }
      const elapsed = PROGRAMMING_EXAM_DURATION_SECONDS - timeLeft;
      void persistProgrammingResult(
        summary?.scorePercent ?? 0,
        Math.max(0, elapsed),
        summary?.answers,
      ).then(
        (result) => {
          if (result?.savedToServer) {
            setMeta('Final submission recorded.');
          } else {
            setMeta(
              'Your code was graded locally but could not be saved to the server. Sign in and retry if this was a live exam.',
            );
          }
        },
        () => {
          setMeta('Submission failed. Check your connection and sign in, then try again.');
        },
      );
    },
    [persistProgrammingResult, timeLeft],
  );

  useEffect(() => {
    if (phase !== 'active' || !endAt) return;
    const tick = () => {
      const left = secondsRemaining(endAt);
      setTimeLeft(left);
      if (left <= 0) {
        void gradeAllProblems().then((graded) =>
          finishExam('timeout', {
            lines: graded.lines,
            scorePercent: graded.scorePercent,
            answers: graded.answers,
          }),
        );
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, endAt, finishExam, gradeAllProblems]);

  const handleSubmitTest = async () => {
    if (locked || submitting) return;
    setSubmitting(true);
    setConsoleTab('output');
    try {
      const graded = await gradeAllProblems();
      finishExam('submit', {
        lines: graded.lines,
        scorePercent: graded.scorePercent,
        answers: graded.answers,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'intro') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-[#0c2340] mb-2">Programming assessment</h1>
          <p className="text-slate-700 mb-6 leading-relaxed">
            {PROGRAMMING_SAMPLE_PROBLEMS.length} coding problems · {CODING_LANGUAGES.length} languages ·{' '}
            <strong>{PROGRAMMING_EXAM_DURATION_SECONDS / 60} minute</strong> timer (HackerRank-style layout).
          </p>
          <ul className="text-sm text-slate-700 space-y-2 mb-8 list-disc pl-5">
            <li>Timer starts when you click Begin — it runs continuously at the top.</li>
            <li>Use <strong>Run</strong> to test with custom or sample input.</li>
            <li>Use <strong>Submit test</strong> to grade all problems before time ends.</li>
            <li>When time reaches zero, the session ends automatically.</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleStart}>
              <Play className="size-4 mr-2" />
              Begin test ({PROGRAMMING_EXAM_DURATION_SECONDS / 60} min)
            </Button>
            <Button variant="outline" asChild>
              <Link href="/tests">Back to practice tests</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const timerUrgent = timeLeft <= 300;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#f0f2f5]">
      {/* Top bar — HackerRank style */}
      <header className="shrink-0 h-12 bg-[#1e3a5f] text-white flex items-center px-3 sm:px-4 gap-3 shadow-md">
        <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide opacity-90 hidden sm:inline">
          RCE · Programming
        </span>
        <div
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1 font-mono text-sm sm:text-base font-bold tabular-nums',
            timerUrgent ? 'bg-red-600 animate-pulse' : 'bg-[#16304f]',
          )}
        >
          <Clock className="size-4 shrink-0" />
          {formatExamTimer(timeLeft)}
        </div>
        <span className="text-sm truncate flex-1 min-w-0">
          Q{problemIndex + 1}/{PROGRAMMING_SAMPLE_PROBLEMS.length}: {problem.title}
        </span>
        <label className="sr-only" htmlFor="exam-language-select">
          Programming language
        </label>
        <select
          id="exam-language-select"
          value={language}
          disabled={locked}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="h-8 min-w-[8.5rem] max-w-[9.5rem] cursor-pointer rounded-md border border-white/50 bg-white px-2 text-xs font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/80 disabled:opacity-50"
        >
          {CODING_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 bg-white/15 text-white hover:bg-white/25 border-0"
          disabled={running || locked}
          onClick={() => void handleRun(customInput)}
        >
          {running ? 'Running…' : 'Run'}
        </Button>
        <Button
          size="sm"
          className="h-8 bg-emerald-500 hover:bg-emerald-400 text-white"
          disabled={submitting || locked}
          onClick={() => void handleSubmitTest()}
        >
          <Send className="size-3.5 mr-1" />
          Submit
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Problem panel */}
        <aside className="w-full max-w-md lg:max-w-lg shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-0">
          <div className="flex border-b border-slate-200 overflow-x-auto">
            {PROGRAMMING_SAMPLE_PROBLEMS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                disabled={locked}
                onClick={() => setProblemIndex(i)}
                className={cn(
                  'px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors',
                  problemIndex === i
                    ? 'border-[#1e3a5f] text-[#1e3a5f] bg-[#1e3a5f]/5'
                    : 'border-transparent text-slate-600 hover:bg-slate-50',
                )}
              >
                {i + 1}. {p.title}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-800 space-y-4">
            <ProblemDescription problem={problem} />
          </div>
        </aside>

        {/* Editor + console */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#1e1e1e]">
          <div className="flex-1 min-h-[280px] p-2">
            <CodeEditor
              key={`${problem.id}-${language}`}
              language={language}
              value={code}
              onChange={setCode}
              height="calc(100vh - 12rem - 220px)"
              readOnly={locked}
            />
          </div>
          <div className="h-[220px] shrink-0 border-t border-slate-600 bg-[#252526] flex flex-col">
            <div className="flex border-b border-slate-600">
              <button
                type="button"
                onClick={() => setConsoleTab('input')}
                className={cn(
                  'px-4 py-2 text-xs font-semibold',
                  consoleTab === 'input' ? 'bg-[#1e1e1e] text-white' : 'text-slate-400',
                )}
              >
                Custom input
              </button>
              <button
                type="button"
                onClick={() => setConsoleTab('output')}
                className={cn(
                  'px-4 py-2 text-xs font-semibold',
                  consoleTab === 'output' ? 'bg-[#1e1e1e] text-white' : 'text-slate-400',
                )}
              >
                Output
              </button>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-slate-300 hover:text-white mr-2"
                disabled={running || locked}
                onClick={() => void handleRun(problem.sampleInput)}
              >
                Run sample
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {consoleTab === 'input' ? (
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  disabled={locked}
                  className="w-full h-full min-h-[120px] bg-[#1e1e1e] text-green-400 font-mono text-sm resize-none border-0 outline-none"
                  spellCheck={false}
                />
              ) : (
                <div>
                  {meta ? <p className="text-xs text-slate-400 mb-2">{meta}</p> : null}
                  <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">{output || '—'}</pre>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {phase === 'ended' ? (
        <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl text-center space-y-4">
            <h2 className="text-xl font-bold text-[#0c2340]">Test ended</h2>
            <p className="text-sm text-slate-700">{output}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button asChild>
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/tests">Practice tests</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProblemDescription({ problem }: { problem: ProgrammingProblem }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-[#0c2340]">{problem.title}</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{problem.difficulty}</span>
      </div>
      <p>{problem.statement}</p>
      <div>
        <p className="font-semibold text-slate-900 mb-1">Input format</p>
        <p className="text-slate-700">{problem.inputFormat}</p>
      </div>
      <div>
        <p className="font-semibold text-slate-900 mb-1">Output format</p>
        <p className="text-slate-700">{problem.outputFormat}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="font-semibold text-slate-900 mb-1">Sample input</p>
          <pre className="bg-slate-50 border rounded p-2 font-mono text-xs">{problem.sampleInput}</pre>
        </div>
        <div>
          <p className="font-semibold text-slate-900 mb-1">Sample output</p>
          <pre className="bg-slate-50 border rounded p-2 font-mono text-xs">{problem.sampleOutput}</pre>
        </div>
      </div>
      {problem.hint ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold">Hint:</span> {problem.hint}
        </p>
      ) : null}
    </>
  );
}
