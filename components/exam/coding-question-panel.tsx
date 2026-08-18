'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { getProgrammingProblemById } from '@/lib/exam-builder/programming-syllabus';
import type { Question } from '@/lib/types';

type CodingAnswerPayload = {
  language: CodingLanguageId;
  sourceCode: string;
};

function parseCodingAnswer(raw: string | null | undefined): CodingAnswerPayload | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { language?: string; sourceCode?: string };
    if (parsed.language && typeof parsed.sourceCode === 'string') {
      return {
        language: getCodingLanguage(parsed.language).id,
        sourceCode: parsed.sourceCode,
      };
    }
  } catch {
    // legacy plain text
  }
  return null;
}

type Props = {
  question: Question;
  answer: string | null | undefined;
  onAnswerChange: (payloadJson: string) => void;
};

/** In-exam coding workspace (Monaco + run) shown when a programming syllabus question is active. */
export function CodingQuestionPanel({ question, answer, onAnswerChange }: Props) {
  const problem = useMemo(
    () =>
      getProgrammingProblemById(question.coding_problem_id ?? '') ?? {
        id: 'inline',
        title: question.coding_title ?? 'Coding problem',
        difficulty: 'Hard' as const,
        statement: question.question_text,
        inputFormat: question.coding_input_format ?? 'See problem statement.',
        outputFormat: question.coding_output_format ?? 'See problem statement.',
        sampleInput: question.coding_sample_input ?? '',
        sampleOutput: question.coding_sample_output ?? '',
        hint: question.coding_hint ?? undefined,
        starterCode: question.coding_starter_code ?? undefined,
        defaultLanguage:
          question.coding_default_language === 'java' ||
          question.coding_default_language === 'python' ||
          question.coding_default_language === 'c'
            ? question.coding_default_language
            : undefined,
        testCases: question.coding_test_cases ?? [],
      },
    [question],
  );

  const lockedLanguage: CodingLanguageId | null =
    problem.defaultLanguage === 'java' || question.coding_default_language === 'java'
      ? 'java'
      : null;
  const languages = lockedLanguage
    ? CODING_LANGUAGES.filter((l) => l.id === lockedLanguage)
    : CODING_LANGUAGES;

  const saved = parseCodingAnswer(answer);
  const initialLang = lockedLanguage ?? saved?.language ?? languages[0]?.id ?? 'java';
  const initialCode =
    saved?.sourceCode ??
    problem.starterCode ??
    getCodingLanguage(initialLang).stub;
  const [language, setLanguage] = useState<CodingLanguageId>(initialLang);
  const [code, setCode] = useState(initialCode);
  const [stdin, setStdin] = useState(problem.sampleInput);
  const [output, setOutput] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const autoRanRef = useRef<string | null>(null);

  useEffect(() => {
    setStdin(problem.sampleInput);
    const nextLang = lockedLanguage ?? 'java';
    const savedAnswer = parseCodingAnswer(answer);
    const nextCode =
      savedAnswer?.sourceCode ??
      problem.starterCode ??
      getCodingLanguage(nextLang).stub;
    setLanguage(savedAnswer?.language && !lockedLanguage ? savedAnswer.language : nextLang);
    setCode(nextCode);
    setOutput(null);
    setMeta(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the question changes
  }, [question.id]);

  const onAnswerChangeRef = useRef(onAnswerChange);
  onAnswerChangeRef.current = onAnswerChange;
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    const payload = JSON.stringify({ language, sourceCode: code });
    if (lastPersistedRef.current === payload) return;
    lastPersistedRef.current = payload;
    onAnswerChangeRef.current(payload);
  }, [language, code]);

  const onLanguageChange = (value: string) => {
    if (lockedLanguage) return;
    const lang = getCodingLanguage(value);
    setLanguage(lang.id);
    setCode(problem.starterCode && lang.id === 'java' ? problem.starterCode : lang.stub);
    setOutput(null);
    setMeta(null);
  };

  const runCode = useCallback(async (input: string) => {
    setRunning(true);
    setOutput(null);
    setMeta(null);
    const source =
      code.trim() ||
      problem.starterCode ||
      getCodingLanguage(language).stub;
    try {
      const data = await runCodingOnServer(language, source, input);
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
    } catch (err) {
      setOutput(err instanceof Error ? err.message : 'Run failed. Sign in and try again.');
    } finally {
      setRunning(false);
    }
  }, [code, language, problem.starterCode]);

  useEffect(() => {
    if (lockedLanguage !== 'java') return;
    if (autoRanRef.current === question.id) return;
    if (!problem.sampleInput) return;
    autoRanRef.current = question.id;
    void runCode(problem.sampleInput);
  }, [question.id, lockedLanguage, problem.sampleInput, runCode]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#1e3a5f]/20 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#1e3a5f]">
            {lockedLanguage === 'java' ? 'Java · auto-run' : 'Programming · write code'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e3a5f]/10 text-[#0c2340] font-semibold">
            {problem.title}
          </span>
          {problem.difficulty ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
              {problem.difficulty}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-800 leading-relaxed">{problem.statement}</p>
        {problem.hint ? (
          <p className="text-xs text-slate-600 mt-2">
            <span className="font-semibold">Hint:</span> {problem.hint}
          </p>
        ) : null}
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="font-semibold text-slate-800">Sample input</p>
            <pre className="mt-1 bg-white border rounded p-2 font-mono">{problem.sampleInput}</pre>
          </div>
          <div>
            <p className="font-semibold text-slate-800">Sample output</p>
            <pre className="mt-1 bg-white border rounded p-2 font-mono">{problem.sampleOutput}</pre>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 border-gray-200 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-3">
            <Select value={language} onValueChange={onLanguageChange} disabled={Boolean(lockedLanguage)}>
              <SelectTrigger className="w-[150px] h-9 bg-white text-sm">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent className="z-[10000] bg-white">
                {languages.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={running}
                onClick={() => void runCode(problem.sampleInput)}
              >
                Run sample
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={running}
                onClick={() => void runCode(stdin)}
              >
                {running ? 'Running…' : 'Run code'}
              </Button>
            </div>
          </div>
          <CodeEditor
            key={`${question.id}-${language}`}
            language={language}
            value={effectiveSourceCode(code, language)}
            onChange={(value) => {
              if (!value.trim() && !code.trim()) return;
              setCode(value);
            }}
            height="min(52vh, 420px)"
          />
        </Card>

        <div className="flex flex-col gap-3 min-h-[280px]">
          <Card className="p-3 border-gray-200 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Custom input</h3>
            <Textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              rows={4}
              className="font-mono text-sm"
              placeholder="stdin"
            />
          </Card>
          <Card className="p-3 border-gray-200 flex-[2] min-h-[160px]">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Output</h3>
            {meta ? <p className="text-xs text-slate-600 mb-2">{meta}</p> : null}
            <pre className="text-sm text-slate-800 whitespace-pre-wrap font-mono max-h-[240px] overflow-auto bg-slate-50 border rounded-lg p-3">
              {output ?? 'Run your code to see output. Your code is saved with this question.'}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
