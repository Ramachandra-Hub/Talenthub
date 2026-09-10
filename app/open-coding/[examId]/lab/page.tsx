'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CodeLabShell } from '@/components/student/portal/coding/code-lab-shell';
import {
  MissionResult,
  type MissionResultData,
} from '@/components/student/portal/coding/mission-result';
import type {
  CodeLabConsoleTab,
  CodeLabProblem,
  CodeLabSubmitSnapshot,
  PublicTestRow,
} from '@/components/student/portal/coding/code-lab-types';
import { isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';
import { runCodingOnServer } from '@/lib/coding/run-client';

type LabProblem = CodeLabProblem & {
  category?: string | null;
  tags?: string[];
  studentExplanation?: string | null;
  starterCode?: Record<string, string>;
  progress?: string;
  position?: number;
  points?: number;
};

type LabPayload = {
  exam: { id: string; title: string; durationMinutes: number };
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    solvedCount: number;
    maxScore: number;
  };
  problems: LabProblem[];
};

function starterFor(problem: LabProblem | null, language: CodingLanguageId): string {
  if (!problem) return '';
  const map = problem.starterCode ?? {};
  return map[language] || map.java || map.python || '';
}

export default function OpenCodingLabPage() {
  const params = useParams();
  const router = useRouter();
  const examId = String(params.examId ?? '');

  const [data, setData] = useState<LabPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [language, setLanguage] = useState<CodingLanguageId>('java');
  const [codeByKey, setCodeByKey] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [runOut, setRunOut] = useState<string | null>(null);
  const [lastSubmit, setLastSubmit] = useState<CodeLabSubmitSnapshot | null>(null);
  const [publicResults, setPublicResults] = useState<PublicTestRow[] | null>(null);
  const [consoleTab, setConsoleTab] = useState<CodeLabConsoleTab>('output');
  const [missionResult, setMissionResult] = useState<MissionResultData | null>(null);
  const [missionResultOpen, setMissionResultOpen] = useState(false);

  const loadLab = useCallback(async () => {
    const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/lab`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load coding lab');
      return null;
    }
    return json as LabPayload;
  }, [examId]);

  useEffect(() => {
    const boot = async () => {
      const payload = await loadLab();
      if (!payload) return;
      setData(payload);
      const initial: Record<string, string> = {};
      for (const p of payload.problems) {
        initial[`${p.id}:java`] = starterFor(p, 'java');
        initial[`${p.id}:python`] = starterFor(p, 'python');
      }
      setCodeByKey(initial);
    };
    void boot();
  }, [loadLab]);

  const problem = data?.problems[activeIdx] ?? null;
  const codeKey = problem ? `${problem.id}:${language}` : '';
  const code = codeKey ? codeByKey[codeKey] ?? '' : '';

  const setCode = useCallback(
    (value: string) => {
      if (!codeKey) return;
      setCodeByKey((prev) => ({ ...prev, [codeKey]: value }));
    },
    [codeKey],
  );

  const clearMissionResult = () => {
    setMissionResultOpen(false);
  };

  const onLanguageChange = (id: CodingLanguageId) => {
    setLanguage(id);
    setRunOut(null);
    setPublicResults(null);
    setLastSubmit(null);
    setConsoleTab('output');
  };

  const onSelectProblem = (idx: number) => {
    setActiveIdx(idx);
    setRunOut(null);
    setPublicResults(null);
    setLastSubmit(null);
    setConsoleTab('output');
    setMissionResult(null);
    setMissionResultOpen(false);
  };

  const onReset = () => {
    if (!problem) return;
    setCode(starterFor(problem, language));
    setRunOut(null);
  };

  const onRun = async () => {
    if (!problem) return;
    setBusy('run');
    setConsoleTab('output');
    try {
      const sample = problem.sampleTests[0];
      const result = await runCodingOnServer(language, code, sample?.input ?? '');
      setRunOut(
        [
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : '',
          `exit: ${result.exitCode}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    } catch (err) {
      setRunOut(err instanceof Error ? err.message : 'Run failed');
      setConsoleTab('errors');
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async () => {
    if (!problem || !data) return;
    setBusy('submit');
    setConsoleTab('tests');
    try {
      const res = await fetch(
        `/api/student/open-coding/${encodeURIComponent(examId)}/problems/${problem.id}/submit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language, sourceCode: code }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setRunOut(json.error ?? 'Submit failed');
        setConsoleTab('errors');
        return;
      }

      const passed = Number(json.passed ?? 0);
      const total = Number(json.total ?? 0);
      const status = String(json.status ?? 'failed');
      const snapshot: CodeLabSubmitSnapshot = {
        passed,
        total,
        status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        language: json.language,
        publicResults: json.publicResults,
      };
      setLastSubmit(snapshot);
      setPublicResults(Array.isArray(json.publicResults) ? json.publicResults : null);
      if (json.publicResults?.length) setConsoleTab('tests');
      if (json.compileOk === false) {
        setRunOut(`Compilation issue · ${passed}/${total} tests passed.`);
        setConsoleTab('errors');
      } else {
        setRunOut(`Submitted · ${passed}/${total} tests passed.`);
      }

      setMissionResult({
        problemId: problem.id,
        problemTitle: `${problem.position ?? ''}. ${problem.title}`.replace(/^\.\s*/, ''),
        passed,
        total,
        status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        language: json.language ?? language,
        publicResults: Array.isArray(json.publicResults) ? json.publicResults : undefined,
      });
      setMissionResultOpen(true);

      const refreshed = await loadLab();
      if (refreshed) setData(refreshed);
    } catch (err) {
      setRunOut(err instanceof Error ? err.message : 'Submit failed');
      setConsoleTab('errors');
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    setBusy('finish');
    try {
      const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/result`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Could not finish exam');
        return;
      }
      clearMissionResult();
      router.push(`/open-coding/${examId}/result`);
    } finally {
      setBusy(null);
    }
  };

  const shellProblems: CodeLabProblem[] = useMemo(
    () =>
      (data?.problems ?? []).map((p) => ({
        id: p.id,
        title: `${p.position ?? ''}. ${p.title}`.replace(/^\.\s*/, ''),
        statement: p.statement,
        constraints: p.constraints,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        difficulty: p.difficulty,
        conceptSlug: [p.category, ...(p.tags ?? [])].filter(Boolean).join(' · '),
        sampleTests: p.sampleTests ?? [],
        hiddenTestCount: p.hiddenTestCount ?? 0,
        best: p.best
          ? {
              passed: Number(p.best.passed ?? 0),
              total: Number(p.best.total ?? 0),
              status: String(p.best.status ?? 'failed'),
              language: String(p.best.language || 'java'),
            }
          : null,
        studentExplanation: p.studentExplanation,
        category: p.category,
        tags: p.tags,
      })),
    [data],
  );

  const solvedCount = (data?.problems ?? []).filter((p) => p.progress === 'solved').length;

  if (error && !data) {
    return (
      <div className="code-lab flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-rose-300">{error}</p>
        <Link href={`/open-coding/${examId}`} className="code-lab-btn code-lab-btn-ghost">
          ← Back to challenge brief
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="code-lab flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Loading Code Lab…
      </div>
    );
  }

  return (
    <div className="code-lab min-h-screen pb-8">
      <MissionResult
        open={missionResultOpen}
        result={missionResult}
        onBackToCodeLab={clearMissionResult}
        onReturnToArena={() => router.push(`/open-coding/${examId}`)}
        showFinishDay
        finishDayDisabled={busy != null}
        finishDayLabel={busy === 'finish' ? 'Finishing…' : 'Finish Challenge & view result'}
        onFinishDay={() => void finish()}
      />

      <div
        className="mx-auto max-w-[1600px] space-y-2 px-2 py-2 sm:px-3"
        style={{ ['--cl-chrome' as string]: '12.5rem' }}
      >
        <div className="code-lab-panel code-lab-mission-bar rounded-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Hard Challenge · {data.exam.durationMinutes} min · Code Lab
            </p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-white">{data.exam.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Code {solvedCount}/5 · Problem {activeIdx + 1} of {shellProblems.length}
            </p>
          </div>
          <Link
            href={`/open-coding/${examId}`}
            className="text-[11px] font-semibold text-cyan-300/80 hover:text-cyan-200"
          >
            Challenge brief →
          </Link>
          <button
            type="button"
            className="code-lab-btn code-lab-btn-primary"
            disabled={busy === 'finish'}
            onClick={() => void finish()}
          >
            {busy === 'finish' ? 'Finishing…' : 'Finish Challenge'}
          </button>
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <CodeLabShell
          dayTitle={data.exam.title}
          weekLabel="Hard Coding Challenge"
          kind="official"
          backHref={`/open-coding/${examId}`}
          backLabel="Back to challenge brief"
          problems={shellProblems}
          activeProblemIdx={activeIdx}
          onSelectProblem={onSelectProblem}
          language={language}
          languages={(['java', 'python'] as CodingLanguageId[]).filter(isCodingLanguageId)}
          onLanguageChange={onLanguageChange}
          code={code}
          onCodeChange={setCode}
          onReset={onReset}
          onRun={() => void onRun()}
          onSubmit={() => void onSubmit()}
          busy={busy}
          runOut={runOut}
          lastSubmit={lastSubmit}
          publicResults={publicResults}
          consoleTab={consoleTab}
          onConsoleTabChange={setConsoleTab}
          codingPassed={solvedCount}
          minCoding={5}
          expandProblemDocument
        />

        <button
          type="button"
          className="code-lab-btn code-lab-btn-ghost w-full py-2.5 text-sm"
          disabled={busy != null}
          onClick={() => void finish()}
        >
          {busy === 'finish' ? 'Finishing…' : 'Finish Challenge & open ElevateX scorecard'}
        </button>
      </div>
    </div>
  );
}
