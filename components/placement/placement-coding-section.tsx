'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/coding/code-editor';
import {
  CODING_LANGUAGES,
  getCodingLanguage,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import {
  formatCodingRunOutput,
  gradeCodingTestCase,
  runCodingBatchOnServer,
  runCodingOnServer,
} from '@/lib/coding/run-client';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import type { PlacementCodingSubmission } from '@/lib/placement/types';

type Props = {
  problems: ProgrammingProblem[];
  submissions: Record<string, PlacementCodingSubmission>;
  onSubmissionChange: (next: PlacementCodingSubmission) => void;
  /** Admin default for programming section (C or Python). */
  defaultLanguage?: CodingLanguageId;
  /** Sidebar heading (e.g. Programming vs Technical coding). */
  sectionTitle?: string;
};

type EditorState = {
  language: CodingLanguageId;
  sourceCode: string;
};

function initialEditorState(
  problem: ProgrammingProblem,
  saved?: PlacementCodingSubmission,
  defaultLanguage?: CodingLanguageId,
): EditorState {
  const lang =
    saved?.language ??
    defaultLanguage ??
    CODING_LANGUAGES[0].id;
  const stub = CODING_LANGUAGES.find((l) => l.id === lang)?.stub ?? CODING_LANGUAGES[0].stub;
  const source = saved?.sourceCode?.trim() ? saved.sourceCode : stub;
  return { language: lang, sourceCode: source };
}

export function PlacementCodingSection({
  problems,
  submissions,
  onSubmissionChange,
  defaultLanguage,
  sectionTitle = 'Coding problems',
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [output, setOutput] = useState<string>(
    'Write your solution, then click Run code to compile and see output.',
  );
  const [editors, setEditors] = useState<Record<string, EditorState>>({});
  const editorsRef = useRef(editors);
  const initKeyRef = useRef('');

  editorsRef.current = editors;

  const problemIds = useMemo(() => problems.map((p) => p.id).join('|'), [problems]);

  useEffect(() => {
    if (!problemIds || initKeyRef.current === problemIds) return;
    initKeyRef.current = problemIds;
    const next: Record<string, EditorState> = {};
    for (const p of problems) {
      next[p.id] = initialEditorState(p, submissions[p.id], defaultLanguage);
    }
    setEditors(next);
  }, [problemIds, problems, submissions]);

  const active = problems[Math.min(activeIndex, Math.max(0, problems.length - 1))];
  const editor = active ? editors[active.id] : null;

  useEffect(() => {
    if (active?.sampleInput != null) {
      setCustomInput(active.sampleInput);
      setOutput('Write your solution, then click Run code to compile and see output.');
    }
  }, [active?.id, active?.sampleInput]);

  const solvedCount = useMemo(
    () =>
      Object.values(submissions).filter((s) => s.totalCases > 0 && s.passedCases === s.totalCases)
        .length,
    [submissions],
  );

  const activeProblemId = active?.id ?? '';

  const setSourceCode = useCallback((sourceCode: string) => {
    if (!activeProblemId) return;
    setEditors((prev) => {
      const row = prev[activeProblemId];
      if (!row || row.sourceCode === sourceCode) return prev;
      return {
        ...prev,
        [activeProblemId]: { ...row, sourceCode },
      };
    });
  }, [activeProblemId]);

  if (!active || !editor) {
    return <Card className="p-6 text-center text-slate-600">No coding questions available.</Card>;
  }

  const setLanguage = (langId: string) => {
    const lang = getCodingLanguage(langId).id;
    setEditors((prev) => {
      const current = prev[active.id];
      const stub = CODING_LANGUAGES.find((l) => l.id === lang)?.stub ?? CODING_LANGUAGES[0].stub;
      return {
        ...prev,
        [active.id]: {
          language: lang,
          sourceCode: current?.sourceCode?.trim() ? current.sourceCode : stub,
        },
      };
    });
  };

  const runCode = async (stdin: string, mode: 'custom' | 'sample' | 'all' = 'custom') => {
    const state = editorsRef.current[active.id];
    if (!state) return;

    const source = state.sourceCode.trim();
    if (!source) {
      setOutput('Write your code in the editor before running.');
      return;
    }

    setRunning(true);
    setOutput(mode === 'all' ? 'Running all test cases…' : 'Compiling and running…');

    try {
      if (mode === 'all' && active.testCases.length > 0) {
        const results = await runCodingBatchOnServer(
          state.language,
          source,
          active.testCases.map((t) => t.input),
        );
        const lines: string[] = [`=== All test cases (${active.testCases.length}) ===`, ''];
        let passed = 0;

        active.testCases.forEach((tc, i) => {
          const data = results[i] ?? { stdout: '', stderr: 'No result', exitCode: 1 };
          const { pass, actual } = gradeCodingTestCase(data, tc.expectedOutput);
          if (pass) passed += 1;
          lines.push(`Test ${i + 1}: ${pass ? 'PASS' : 'FAIL'}`);
          lines.push(`Input:\n${tc.input}`);
          lines.push(`Expected:\n${tc.expectedOutput.trim()}`);
          lines.push(`Your output:\n${actual || '(empty)'}`);
          if (data.stderr?.trim()) {
            lines.push(`stderr:\n${data.stderr.trim()}`);
          }
          if (tc.explanation) lines.push(`Note: ${tc.explanation}`);
          lines.push('');
        });

        lines.push(`Score: ${passed}/${active.testCases.length} test cases passed`);

        onSubmissionChange({
          problemId: active.id,
          language: state.language,
          sourceCode: source,
          passedCases: passed,
          totalCases: active.testCases.length,
          lastRunAt: new Date().toISOString(),
        });

        setOutput(lines.join('\n'));
        return;
      }

      const data = await runCodingOnServer(state.language, source, stdin);
      const lines: string[] = [formatCodingRunOutput(data)];

      const sampleCase = active.testCases[0];
      if (sampleCase && (mode === 'sample' || stdin.trim() === sampleCase.input.trim())) {
        const { pass, actual } = gradeCodingTestCase(data, sampleCase.expectedOutput);
        lines.push('');
        lines.push('--- Sample check ---');
        lines.push(`Expected:\n${sampleCase.expectedOutput.trim()}`);
        lines.push(`Got:\n${actual || '(empty)'}`);
        lines.push(`Result: ${pass ? 'PASS' : 'FAIL'}`);

        onSubmissionChange({
          problemId: active.id,
          language: state.language,
          sourceCode: source,
          passedCases: pass ? 1 : 0,
          totalCases: active.testCases.length,
          lastRunAt: new Date().toISOString(),
        });
      } else {
        onSubmissionChange({
          problemId: active.id,
          language: state.language,
          sourceCode: source,
          passedCases: submissions[active.id]?.passedCases ?? 0,
          totalCases: active.testCases.length,
          lastRunAt: new Date().toISOString(),
        });
      }

      setOutput(lines.join('\n'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not run your code.';
      setOutput(
        `${msg}\n\nMake sure you are logged in. If this keeps failing, try again in a few seconds.`,
      );
    } finally {
      setRunning(false);
    }
  };

  const sub = submissions[active.id];
  const lastScore =
    sub && sub.totalCases > 0
      ? `${sub.passedCases}/${sub.totalCases} test cases passed`
      : 'Run sample or all tests to check your answer';

  return (
    <div className="grid lg:grid-cols-4 gap-4">
      <Card className="lg:col-span-1 p-4 border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">{sectionTitle}</h3>
        <p className="text-xs text-slate-600 mb-3">
          Solved fully: {solvedCount}/{problems.length}
        </p>
        <div className="space-y-2">
          {problems.map((p, i) => {
            const row = submissions[p.id];
            const solved = row && row.totalCases > 0 && row.passedCases === row.totalCases;
            return (
              <button
                key={p.id}
                type="button"
                className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${i === activeIndex ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-slate-200'} `}
                onClick={() => setActiveIndex(i)}
              >
                <p className="font-semibold text-slate-900">
                  {i + 1}. {p.title}
                </p>
                <p className="text-xs text-slate-600">{solved ? 'Solved' : 'Not solved'}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="lg:col-span-3 space-y-4">
        <Card className="p-4 border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">{active.title}</h2>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1e3a5f] mt-1">
            {problems.length} unique coding problems in your exam (non-repeating)
          </p>
          {active.examPurpose ? (
            <p className="text-sm text-slate-600 mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
              <span className="font-semibold text-slate-800">What this tests: </span>
              {active.examPurpose}
            </p>
          ) : null}
          <p className="text-sm text-slate-700 mt-2">{active.statement}</p>
          {active.studentGuide ? (
            <p className="text-sm text-slate-600 mt-2 rounded-lg bg-blue-50/80 border border-blue-100 p-3">
              <span className="font-semibold text-slate-800">How to approach: </span>
              {active.studentGuide}
            </p>
          ) : null}
          <p className="text-xs text-slate-500 mt-2">
            Run code to compile and see output in the panel below. Use <strong>Run sample</strong> for
            the example case, or <strong>Run all tests</strong> to check every hidden case. Last
            result: <span className="font-semibold text-slate-700">{lastScore}</span>
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
            <div>
              <p className="font-semibold">Sample input</p>
              <pre className="bg-slate-50 border rounded p-2 mt-1 whitespace-pre-wrap">{active.sampleInput}</pre>
            </div>
            <div>
              <p className="font-semibold">Expected sample output</p>
              <pre className="bg-slate-50 border rounded p-2 mt-1 whitespace-pre-wrap">{active.sampleOutput}</pre>
            </div>
          </div>
          {active.inputFormat ? (
            <p className="text-xs text-slate-500 mt-2">
              <span className="font-semibold">Input format:</span> {active.inputFormat}
            </p>
          ) : null}
          {active.outputFormat ? (
            <p className="text-xs text-slate-500 mt-1">
              <span className="font-semibold">Output format:</span> {active.outputFormat}
            </p>
          ) : null}
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            <select
              className="h-9 rounded border border-slate-300 px-2 text-sm"
              value={editor.language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {CODING_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={running} onClick={() => void runCode(customInput, 'custom')}>
              {running ? 'Running…' : 'Run code'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={running}
              onClick={() => void runCode(active.sampleInput, 'sample')}
            >
              Run sample
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={running || active.testCases.length === 0}
              onClick={() => void runCode('', 'all')}
            >
              Run all tests ({active.testCases.length})
            </Button>
          </div>
          <CodeEditor
            key={active.id}
            language={editor.language}
            value={editor.sourceCode}
            onChange={setSourceCode}
            height="420px"
          />
        </Card>

        <Card className="p-4 border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Custom input
          </p>
          <textarea
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            rows={3}
            className="w-full font-mono text-sm border border-slate-200 rounded p-2 mb-3"
            spellCheck={false}
          />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Compiler output
          </p>
          <pre className="text-sm whitespace-pre-wrap font-mono bg-slate-50 border rounded p-3 max-h-96 overflow-auto min-h-[4rem]">
            {output}
          </pre>
        </Card>
      </div>
    </div>
  );
}
