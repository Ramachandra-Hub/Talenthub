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

/** In-exam coding workspace. Students write the code; Run compiles and shows output only. */
export function CodingQuestionPanel({ question, answer, onAnswerChange }: Props) {
  const problem = useMemo(() => {
    const catalog = getProgrammingProblemById(question.coding_problem_id ?? '');
    return {
      id: catalog?.id ?? 'inline',
      title: question.coding_title ?? catalog?.title ?? 'Coding problem',
      difficulty: catalog?.difficulty ?? ('Hard' as const),
      statement: question.question_text || catalog?.statement || '',
      inputFormat: question.coding_input_format ?? catalog?.inputFormat ?? 'See problem statement.',
      outputFormat: question.coding_output_format ?? catalog?.outputFormat ?? 'See problem statement.',
      sampleInput: question.coding_sample_input ?? catalog?.sampleInput ?? '',
      sampleOutput: question.coding_sample_output ?? catalog?.sampleOutput ?? '',
      defaultLanguage:
        question.coding_default_language === 'java' ||
        question.coding_default_language === 'python' ||
        question.coding_default_language === 'c'
          ? question.coding_default_language
          : catalog?.defaultLanguage,
    };
  }, [question]);

  const lockedLanguage: CodingLanguageId | null =
    problem.defaultLanguage === 'java' || question.coding_default_language === 'java'
      ? 'java'
      : null;
  const languages = lockedLanguage
    ? CODING_LANGUAGES.filter((l) => l.id === lockedLanguage)
    : CODING_LANGUAGES;

  const saved = parseCodingAnswer(answer);
  const initialLang = lockedLanguage ?? saved?.language ?? languages[0]?.id ?? 'java';
  const [language, setLanguage] = useState<CodingLanguageId>(initialLang);
  const [code, setCode] = useState(saved?.sourceCode ?? '');
  const [stdin, setStdin] = useState(problem.sampleInput);
  const [output, setOutput] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setStdin(problem.sampleInput);
    const savedAnswer = parseCodingAnswer(answer);
    const nextLang = lockedLanguage ?? savedAnswer?.language ?? 'java';
    setLanguage(nextLang);
    setCode(savedAnswer?.sourceCode ?? '');
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
    setOutput(null);
    setMeta(null);
  };

  const runCode = useCallback(async (input: string) => {
    if (!code.trim()) {
      setMeta(null);
      setOutput('Write your program in the editor, then click Run to compile and see output.');
      return;
    }
    setRunning(true);
    setOutput(null);
    setMeta(null);
    try {
      const data = await runCodingOnServer(language, code, input);
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
  }, [code, language]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#1e3a5f]/20 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[#1e3a5f]">
            {lockedLanguage === 'java' ? 'Java · write your program' : 'Programming · write your program'}
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
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="font-semibold text-slate-800">Input format</p>
            <p className="mt-1 text-slate-700">{problem.inputFormat}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">Output format</p>
            <p className="mt-1 text-slate-700">{problem.outputFormat}</p>
          </div>
        </div>
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

      <Card className="p-3 sm:p-4 border-gray-200 shadow-sm">
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
              {running ? 'Compiling…' : 'Compile & run'}
            </Button>
          </div>
        </div>
        <CodeEditor
          key={`${question.id}-${language}`}
          language={language}
          value={code}
          onChange={(value) => {
            if (!value.trim() && !code.trim()) return;
            setCode(value);
          }}
          height="min(62vh, 560px)"
        />
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <div>
            <h3 className="text-xs font-semibold text-gray-900 mb-1">Custom input</h3>
            <Textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              rows={2}
              className="font-mono text-xs min-h-[56px] max-h-[72px] resize-none"
              placeholder="stdin"
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-900 mb-1">Output</h3>
            {meta ? <p className="text-[10px] text-slate-600 mb-1 truncate">{meta}</p> : null}
            <pre className="text-xs text-slate-800 whitespace-pre-wrap font-mono h-[56px] overflow-auto bg-slate-50 border rounded-md px-2 py-1">
              {output ?? 'Compile to see output.'}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
