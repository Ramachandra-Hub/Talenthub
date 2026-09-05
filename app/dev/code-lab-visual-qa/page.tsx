'use client';

import { useState } from 'react';
import { CodeLabShell } from '@/components/student/portal/coding/code-lab-shell';
import type {
  CodeLabConsoleTab,
  CodeLabProblem,
  CodeLabSubmitSnapshot,
  PublicTestRow,
} from '@/components/student/portal/coding/code-lab-types';
import type { CodingLanguageId } from '@/lib/coding/languages';

const PROBLEMS: CodeLabProblem[] = [
  {
    id: 'p1',
    title: 'Two Sum',
    statement:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
    constraints: '2 ≤ nums.length ≤ 10^4\n-10^9 ≤ nums[i] ≤ 10^9',
    inputFormat: 'First line: n target\nSecond line: n integers',
    outputFormat: 'Two indices separated by space',
    difficulty: 'Easy',
    conceptSlug: 'arrays',
    sampleTests: [
      { input: '4 9\n2 7 11 15', expectedOutput: '0 1' },
      { input: '3 6\n3 2 4', expectedOutput: '1 2' },
    ],
    hiddenTestCount: 8,
    best: null,
  },
  {
    id: 'p2',
    title: 'Valid Parentheses',
    statement: 'Given a string s containing just the characters (, ), {, }, [ and ], determine if the input string is valid.',
    constraints: '1 ≤ s.length ≤ 10^4',
    inputFormat: 'A single string',
    outputFormat: 'true or false',
    difficulty: 'Easy',
    conceptSlug: 'stacks',
    sampleTests: [{ input: '()[]{}', expectedOutput: 'true' }],
    hiddenTestCount: 5,
    best: { passed: 6, total: 6, status: 'passed', language: 'java' },
  },
  {
    id: 'p3',
    title: 'Binary Search',
    statement: 'Given a sorted array of integers and a target, return the index if found, otherwise -1.',
    constraints: '1 ≤ n ≤ 10^5',
    inputFormat: 'n target then n ints',
    outputFormat: 'Single integer index',
    difficulty: 'Medium',
    conceptSlug: 'binary-search',
    sampleTests: [{ input: '5 9\n1 3 5 9 12', expectedOutput: '3' }],
    hiddenTestCount: 10,
    best: { passed: 2, total: 11, status: 'failed', language: 'python' },
  },
];

const STARTERS: Record<string, Record<CodingLanguageId, string>> = {
  p1: {
    java: 'class Solution {\n  public int[] twoSum(int[] nums, int target) {\n    // write your code\n    return new int[]{};\n  }\n}\n',
    python: 'def two_sum(nums, target):\n    # write your code\n    return []\n',
  },
  p2: {
    java: 'class Solution {\n  public boolean isValid(String s) {\n    return false;\n  }\n}\n',
    python: 'def is_valid(s):\n    return False\n',
  },
  p3: {
    java: 'class Solution {\n  public int search(int[] nums, int target) {\n    return -1;\n  }\n}\n',
    python: 'def search(nums, target):\n    return -1\n',
  },
};

/** Local visual QA only — not under /dsa auth gate. Disabled in production builds. */
export default function CodeLabVisualQaPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="code-lab flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Visual QA preview is unavailable in production.
      </div>
    );
  }

  const [problems, setProblems] = useState(PROBLEMS);
  const [idx, setIdx] = useState(0);
  const [language, setLanguage] = useState<CodingLanguageId>('java');
  const [code, setCode] = useState(STARTERS.p1.java);
  const [busy, setBusy] = useState<string | null>(null);
  const [runOut, setRunOut] = useState<string | null>(null);
  const [lastSubmit, setLastSubmit] = useState<CodeLabSubmitSnapshot | null>(null);
  const [publicResults, setPublicResults] = useState<PublicTestRow[] | null>(null);
  const [consoleTab, setConsoleTab] = useState<CodeLabConsoleTab>('output');

  const codingPassed = problems.filter((p) => p.best?.status === 'passed').length;

  return (
    <div className="code-lab min-h-screen pb-10">
      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5">
        <p className="mb-3 text-[11px] text-amber-200/80">
          DEV ONLY — Code Lab visual QA (fixture data, no API calls)
        </p>
        <CodeLabShell
          dayTitle="Day 1 · Arrays Warmup"
          weekLabel="Week 1 · Foundations"
          kind="official"
          backHref="/dsa"
          problems={problems}
          activeProblemIdx={idx}
          onSelectProblem={(i) => {
            setIdx(i);
            const p = problems[i];
            setCode(STARTERS[p.id]?.[language] ?? '');
            setRunOut(null);
            setLastSubmit(null);
            setPublicResults(null);
            setConsoleTab('output');
          }}
          language={language}
          languages={['java', 'python']}
          onLanguageChange={(id) => {
            setLanguage(id);
            setCode(STARTERS[problems[idx].id]?.[id] ?? '');
          }}
          code={code}
          onCodeChange={setCode}
          onReset={() => {
            setCode(STARTERS[problems[idx].id]?.[language] ?? '');
            setRunOut(null);
          }}
          onRun={() => {
            setBusy('run');
            setConsoleTab('output');
            setRunOut('Running sample…');
            window.setTimeout(() => {
              setRunOut('0 1\n(exit 0)');
              setBusy(null);
            }, 700);
          }}
          onSubmit={() => {
            setBusy('submit');
            setConsoleTab('tests');
            window.setTimeout(() => {
              const results: PublicTestRow[] = [
                { passed: true },
                { passed: true },
                { passed: false, stderr: 'Wrong answer on a sample test' },
              ];
              const snap: CodeLabSubmitSnapshot = {
                passed: 2,
                total: 3,
                status: 'failed',
                compileOk: true,
                publicResults: results,
              };
              setPublicResults(results);
              setLastSubmit(snap);
              setRunOut('Submitted · 2/3 tests passed.');
              setProblems((prev) =>
                prev.map((p, i) =>
                  i === idx
                    ? { ...p, best: { passed: 2, total: 3, status: 'failed', language } }
                    : p,
                ),
              );
              setBusy(null);
            }, 900);
          }}
          busy={busy}
          runOut={runOut}
          lastSubmit={lastSubmit}
          publicResults={publicResults}
          consoleTab={consoleTab}
          onConsoleTabChange={setConsoleTab}
          codingPassed={codingPassed}
          minCoding={3}
        />
      </div>
    </div>
  );
}
