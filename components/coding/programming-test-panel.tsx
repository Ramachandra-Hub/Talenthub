'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CodeEditor } from '@/components/coding/code-editor';
import {
  CODING_LANGUAGES,
  getCodingLanguage,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import { effectiveSourceCode } from '@/lib/coding/effective-source';
import { formatCodingRunOutput, runCodingOnServer } from '@/lib/coding/run-client';
import {
  PROGRAMMING_SAMPLE_PROBLEMS,
  type ProgrammingProblem,
} from '@/lib/coding/sample-problems';
import { cn } from '@/lib/utils';

type Props = {
  /** Show problem picker sidebar */
  showProblemList?: boolean;
  className?: string;
};

export function ProgrammingTestPanel({ showProblemList = true, className }: Props) {
  const [language, setLanguage] = useState<CodingLanguageId>(CODING_LANGUAGES[0].id);
  const [code, setCode] = useState<string>(CODING_LANGUAGES[0].stub);
  const [stdin, setStdin] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [problemId, setProblemId] = useState(PROGRAMMING_SAMPLE_PROBLEMS[0].id);

  const problem =
    PROGRAMMING_SAMPLE_PROBLEMS.find((p) => p.id === problemId) ?? PROGRAMMING_SAMPLE_PROBLEMS[0];

  const onLanguageChange = (value: string) => {
    const lang = getCodingLanguage(value);
    setLanguage(lang.id);
    setCode(lang.stub);
    setOutput(null);
    setMeta(null);
  };

  useEffect(() => {
    setStdin(problem.sampleInput);
  }, [problem.id, problem.sampleInput]);

  const runCode = useCallback(
    async (input: string) => {
      setRunning(true);
      setOutput(null);
      setMeta(null);
      const source = effectiveSourceCode(code, language);
      try {
        const data = await runCodingOnServer(language, source, input);
        setMeta(
          [
            data.engine && `Engine: ${data.engine}`,
            data.runtimeMs !== undefined && `Time: ${data.runtimeMs}ms`,
            data.memoryKb != null && `Memory: ${data.memoryKb}KB`,
            data.exitCode !== undefined && `Exit: ${data.exitCode}`,
          ]
            .filter(Boolean)
            .join(' · '),
        );
        setOutput(formatCodingRunOutput(data));
      } catch (err) {
        setOutput(err instanceof Error ? err.message : 'Run failed. Sign in and try again.');
      } finally {
        setRunning(false);
      }
    },
    [language, code],
  );

  const runSample = () => void runCode(stdin);
  const runAgainstSample = () => void runCode(problem.sampleInput);

  return (
    <div className={cn('grid gap-4', showProblemList ? 'lg:grid-cols-[280px_1fr]' : '', className)}>
      {showProblemList ? (
        <Card className="p-3 lux-surface h-fit lg:sticky lg:top-24">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#1e3a5f] mb-3">Problems</h2>
          <ul className="space-y-2">
            {PROGRAMMING_SAMPLE_PROBLEMS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProblemId(p.id)}
                  className={cn(
                    'w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors',
                    problemId === p.id
                      ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#0c2340] font-semibold'
                      : 'border-slate-200 hover:border-slate-300 text-slate-800',
                  )}
                >
                  <span className="block">{p.title}</span>
                  <span className="text-xs text-slate-600 font-normal">{p.difficulty}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="space-y-4 min-w-0">
        <Card className="p-4 lux-surface">
          <ProblemBrief problem={problem} />
        </Card>

        <div className="grid xl:grid-cols-2 gap-4">
          <Card className="p-4 lux-surface flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger className="w-[160px] bg-white">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
              <SelectContent className="z-[10000] bg-white text-slate-900 border-slate-200">
                {CODING_LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-slate-900">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={runAgainstSample} disabled={running}>
                  Run sample
                </Button>
                <Button size="sm" onClick={runSample} disabled={running}>
                  {running ? 'Running…' : 'Run code'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              {CODING_LANGUAGES.length} languages · Monaco editor · runs on college server (local compilers)
            </p>
            <CodeEditor
              key={language}
              language={language}
              value={effectiveSourceCode(code, language)}
              onChange={(value) => {
                if (!value.trim() && !code.trim()) return;
                setCode(value);
              }}
              height="400px"
            />
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="p-4 lux-surface">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Custom input</h3>
              <Textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                rows={5}
                className="font-mono text-sm bg-white"
                placeholder="stdin"
              />
              <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-700 mb-1">Expected (sample)</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded p-2 font-mono whitespace-pre-wrap">
                    {problem.sampleOutput}
                  </pre>
                </div>
              </div>
            </Card>

            <Card className="p-4 lux-surface flex-1 min-h-[240px]">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Output</h3>
              {meta ? <p className="text-xs text-slate-600 mb-2">{meta}</p> : null}
              <pre className="text-sm text-slate-800 whitespace-pre-wrap font-mono max-h-[360px] overflow-auto bg-slate-50 border border-slate-200 rounded-lg p-3">
                {output ?? 'Run your code to see output.'}
              </pre>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProblemBrief({ problem }: { problem: ProgrammingProblem }) {
  return (
    <div className="space-y-3 text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-[#0c2340]">{problem.title}</h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
          {problem.difficulty}
        </span>
      </div>
      <p>{problem.statement}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="font-semibold text-slate-900 mb-1">Input</p>
          <p className="text-slate-700">{problem.inputFormat}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900 mb-1">Output</p>
          <p className="text-slate-700">{problem.outputFormat}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="font-semibold text-slate-900 mb-1">Sample input</p>
          <pre className="bg-slate-50 border border-slate-200 rounded p-2 font-mono text-xs">
            {problem.sampleInput}
          </pre>
        </div>
        <div>
          <p className="font-semibold text-slate-900 mb-1">Sample output</p>
          <pre className="bg-slate-50 border border-slate-200 rounded p-2 font-mono text-xs">
            {problem.sampleOutput}
          </pre>
        </div>
      </div>
      {problem.hint ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold">Hint:</span> {problem.hint}
        </p>
      ) : null}
    </div>
  );
}
