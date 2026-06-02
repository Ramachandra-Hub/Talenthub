'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/coding/code-editor';
import {
  CODING_LANGUAGES,
  getCodingLanguage,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import { effectiveSourceCode } from '@/lib/coding/effective-source';
import { outputsMatch, type ProgrammingProblem } from '@/lib/coding/sample-problems';
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

  useEffect(() => {
    const initial: Record<string, EditorState> = {};
    for (const p of problems) {
      const saved = submissions[p.id];
      initial[p.id] = {
        language: saved?.language ?? CODING_LANGUAGES[0].id,
        sourceCode: saved?.sourceCode ?? CODING_LANGUAGES[0].stub,
      };
    }
    setEditors(initial);
  }, [problems, submissions]);

  const active = problems[Math.min(activeIndex, Math.max(0, problems.length - 1))];
  const editor = active ? editors[active.id] : null;
  const solvedCount = useMemo(
    () =>
      Object.values(submissions).filter((s) => s.totalCases > 0 && s.passedCases === s.totalCases)
        .length,
    [submissions],
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
    setEditors((prev) => ({
      ...prev,
      [active.id]: { ...prev[active.id], sourceCode },
    }));
  };

  const runWithInput = async (stdin: string) => {
    setRunning(true);
    setOutput('Running...');
    try {
      const res = await fetch('/api/v2/coding/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: editor.language,
          sourceCode: effectiveSourceCode(editor.sourceCode, editor.language),
          stdin,
        }),
      });
      const json = (await res.json()) as { stdout?: string; stderr?: string; error?: string };
      if (!res.ok) {
        setOutput(json.error ?? 'Run failed');
        return null;
      }
      const out = json.stdout ?? '';
      setOutput([out ? `stdout:\n${out}` : '', json.stderr ? `stderr:\n${json.stderr}` : ''].filter(Boolean).join('\n\n') || '(no output)');
      return out;
    } catch {
      setOutput('Run failed. Check network/execution service.');
      return null;
    } finally {
      setRunning(false);
    }
  };

  const runSample = async () => {
    await runWithInput(active.sampleInput);
  };

  const runAllTests = async () => {
    setRunning(true);
    let passed = 0;
    let total = active.testCases.length;
    const lines: string[] = [];
    for (let i = 0; i < active.testCases.length; i++) {
      const tc = active.testCases[i];
      try {
        const res = await fetch('/api/v2/coding/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: editor.language,
            sourceCode: effectiveSourceCode(editor.sourceCode, editor.language),
            stdin: tc.input,
          }),
        });
        const json = (await res.json()) as { stdout?: string; error?: string };
        if (!res.ok) {
          lines.push(`Case ${i + 1}: runtime error`);
          continue;
        }
        const ok = outputsMatch(json.stdout ?? '', tc.expectedOutput);
        if (ok) passed += 1;
        lines.push(`Case ${i + 1}: ${ok ? 'PASS' : 'FAIL'} (expected "${tc.expectedOutput}")`);
      } catch {
        lines.push(`Case ${i + 1}: failed to run`);
      }
    }
    onSubmissionChange({
      problemId: active.id,
      language: editor.language,
      sourceCode: editor.sourceCode,
      passedCases: passed,
      totalCases: total,
      lastRunAt: new Date().toISOString(),
    });
    setOutput(`${lines.join('\n')}\n\nResult: ${passed}/${total} passed`);
    setRunning(false);
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
          <p className="text-sm text-slate-700 mt-2">{active.statement}</p>
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
            language={editor.language}
            value={effectiveSourceCode(editor.sourceCode, editor.language)}
            onChange={setSourceCode}
            height="420px"
          />
        </Card>

        <Card className="p-4 border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Compiler output</p>
          <pre className="text-sm whitespace-pre-wrap font-mono bg-slate-50 border rounded p-3 max-h-56 overflow-auto">
            {output}
          </pre>
        </Card>
      </div>
    </div>
  );
}

