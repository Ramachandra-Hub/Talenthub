'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/coding/code-editor';
import {
  CODING_LANGUAGES,
  getCodingLanguage,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import { effectiveSourceCode } from '@/lib/coding/effective-source';
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
};

type EditorState = {
  language: CodingLanguageId;
  sourceCode: string;
};

export function PlacementCodingSection({ problems, submissions, onSubmissionChange }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string>('Run code to view output.');
  const [editors, setEditors] = useState<Record<string, EditorState>>({});

  const problemIds = useMemo(() => problems.map((p) => p.id).join('|'), [problems]);

  useEffect(() => {
    setEditors((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of problems) {
        if (next[p.id]) continue;
        const saved = submissions[p.id];
        const lang = saved?.language ?? CODING_LANGUAGES[0].id;
        next[p.id] = {
          language: lang,
          sourceCode: saved?.sourceCode?.trim()
            ? saved.sourceCode
            : (CODING_LANGUAGES.find((l) => l.id === lang)?.stub ?? CODING_LANGUAGES[0].stub),
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [problemIds, problems, submissions]);

  const active = problems[Math.min(activeIndex, Math.max(0, problems.length - 1))];
  const editor = active ? editors[active.id] : null;
  const testCases = active?.testCases ?? [];

  const solvedCount = useMemo(
    () =>
      Object.values(submissions).filter((s) => s.totalCases > 0 && s.passedCases === s.totalCases)
        .length,
    [submissions],
  );

  const resolveSource = useCallback(
    (state: EditorState) => effectiveSourceCode(state.sourceCode, state.language),
    [],
  );

  if (!active || !editor) {
    return <Card className="p-6 text-center text-slate-600">No coding questions available.</Card>;
  }

  const setLanguage = (langId: string) => {
    const lang = getCodingLanguage(langId).id;
    setEditors((prev) => ({
      ...prev,
      [active.id]: {
        language: lang,
        sourceCode: CODING_LANGUAGES.find((l) => l.id === lang)?.stub ?? CODING_LANGUAGES[0].stub,
      },
    }));
  };

  const setSourceCode = (sourceCode: string) => {
    if (!sourceCode.trim() && !editor.sourceCode.trim()) return;
    setEditors((prev) => ({
      ...prev,
      [active.id]: { ...prev[active.id], sourceCode },
    }));
  };

  const runWithInput = async (stdin: string) => {
    setRunning(true);
    setOutput('Running…');
    try {
      const data = await runCodingOnServer(editor.language, resolveSource(editor), stdin);
      setOutput(formatCodingRunOutput(data));
      return data;
    } catch (err) {
      setOutput(err instanceof Error ? err.message : 'Run failed. Check network/execution service.');
      return null;
    } finally {
      setRunning(false);
    }
  };

  const runSample = async () => {
    await runWithInput(active.sampleInput);
  };

  const runAllTests = async () => {
    if (!testCases.length) {
      setOutput('No test cases are configured for this problem. Refresh the exam or contact the admin.');
      return;
    }

    setRunning(true);
    setOutput(`Running ${testCases.length} test case(s)…`);

    const source = resolveSource(editor);
    let passed = 0;
    const lines: string[] = [];

    try {
      let batchResults: Awaited<ReturnType<typeof runCodingBatchOnServer>>;
      try {
        batchResults = await runCodingBatchOnServer(
          editor.language,
          source,
          testCases.map((tc) => tc.input),
        );
      } catch (batchErr) {
        const msg = batchErr instanceof Error ? batchErr.message : 'Batch run failed';
        if (!/timed out|timeout/i.test(msg)) throw batchErr;
        setOutput(`${msg}\n\nRetrying cases one at a time…`);
        batchResults = [];
        for (const tc of testCases) {
          try {
            batchResults.push(await runCodingOnServer(editor.language, source, tc.input));
          } catch (oneErr) {
            batchResults.push({
              stdout: '',
              stderr: '',
              exitCode: 1,
              error: oneErr instanceof Error ? oneErr.message : 'Run failed',
            });
          }
        }
      }

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const data = batchResults[i] ?? { stdout: '', stderr: '', exitCode: 1, error: 'No result' };
        lines.push(`--- Case ${i + 1} ---`);
        lines.push(`Input: ${tc.input.replace(/\n/g, '\\n')}`);

        if (data.error) {
          lines.push(`Status: ERROR`);
          lines.push(data.error);
          lines.push('');
          continue;
        }

        const { pass, actual } = gradeCodingTestCase(data, tc.expectedOutput);
        if (pass) passed += 1;

        lines.push(`Status: ${pass ? 'PASS' : 'FAIL'}`);
        lines.push(`Expected: ${tc.expectedOutput.trim()}`);
        lines.push(`Got: ${actual || '(empty)'}`);
        if (data.exitCode != null && data.exitCode !== 0) {
          lines.push(`Exit code: ${data.exitCode}`);
        }
        if (data.stdout?.trim()) {
          lines.push(`stdout:\n${data.stdout.trimEnd()}`);
        }
        if (data.stderr?.trim()) {
          lines.push(`stderr:\n${data.stderr.trimEnd()}`);
        }
        if (tc.explanation) {
          lines.push(`Note: ${tc.explanation}`);
        }
        lines.push('');
      }

      onSubmissionChange({
        problemId: active.id,
        language: editor.language,
        sourceCode: editor.sourceCode,
        passedCases: passed,
        totalCases: testCases.length,
        lastRunAt: new Date().toISOString(),
      });

      setOutput(`${lines.join('\n')}\nResult: ${passed}/${testCases.length} passed`);
    } catch (err) {
      setOutput(err instanceof Error ? err.message : 'Run all test cases failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-4 gap-4">
      <Card className="lg:col-span-1 p-4 border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Technical coding (3)</h3>
        <p className="text-xs text-slate-600 mb-3">Solved fully: {solvedCount}/{problems.length}</p>
        <div className="space-y-2">
          {problems.map((p, i) => {
            const sub = submissions[p.id];
            const solved = sub && sub.totalCases > 0 && sub.passedCases === sub.totalCases;
            return (
              <button
                key={p.id}
                type="button"
                className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${i === activeIndex ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-slate-200'} `}
                onClick={() => setActiveIndex(i)}
              >
                <p className="font-semibold text-slate-900">{i + 1}. {p.title}</p>
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
            {testCases.length} test cases (sample + hidden). Run all to see stdout/stderr and explanations.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
            <div>
              <p className="font-semibold">Sample input</p>
              <pre className="bg-slate-50 border rounded p-2 mt-1">{active.sampleInput}</pre>
            </div>
            <div>
              <p className="font-semibold">Sample output</p>
              <pre className="bg-slate-50 border rounded p-2 mt-1">{active.sampleOutput}</pre>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              className="h-9 rounded border border-slate-300 px-2 text-sm"
              value={editor.language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {CODING_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" disabled={running} onClick={() => void runSample()}>
              Run sample
            </Button>
            <Button size="sm" disabled={running} onClick={() => void runAllTests()}>
              {running ? 'Running…' : 'Run all test cases'}
            </Button>
          </div>
          <CodeEditor
            key={`${active.id}-${editor.language}`}
            language={editor.language}
            value={resolveSource(editor)}
            onChange={setSourceCode}
            height="420px"
          />
        </Card>

        <Card className="p-4 border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Compiler output</p>
          <pre className="text-sm whitespace-pre-wrap font-mono bg-slate-50 border rounded p-3 max-h-96 overflow-auto min-h-[4rem]">
            {output}
          </pre>
        </Card>
      </div>
    </div>
  );
}
