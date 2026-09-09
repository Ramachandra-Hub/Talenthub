'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DsaVictoryOverlay } from '@/components/dsa/dsa-victory-overlay';
import { CodeLabShell } from '@/components/student/portal/coding/code-lab-shell';
import {
  MissionResult,
  type MissionResultData,
} from '@/components/student/portal/coding/mission-result';
import type {
  CodeLabConsoleTab,
  CodeLabSubmitSnapshot,
  PublicTestRow,
} from '@/components/student/portal/coding/code-lab-types';
import { getClientUser } from '@/lib/client-auth';
import { isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';
import { runCodingOnServer } from '@/lib/coding/run-client';

type Mcq = {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  selected: string | null;
  answered: boolean;
};

type Problem = {
  id: string;
  title: string;
  statement: string;
  constraints: string | null;
  inputFormat: string;
  outputFormat: string;
  difficulty: string;
  conceptSlug: string;
  starterCode: unknown;
  sampleTests: Array<{ input: string; expectedOutput: string }>;
  hiddenTestCount: number;
  best: { passed: number; total: number; status: string; language: string } | null;
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
  const map =
    problem.starterCode && typeof problem.starterCode === 'object'
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
  const [activeProblemIdx, setActiveProblemIdx] = useState(0);
  const [runOut, setRunOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [victory, setVictory] = useState<{ stars: number; message: string } | null>(null);
  const [lastSubmit, setLastSubmit] = useState<CodeLabSubmitSnapshot | null>(null);
  const [publicResults, setPublicResults] = useState<PublicTestRow[] | null>(null);
  const [consoleTab, setConsoleTab] = useState<CodeLabConsoleTab>('output');
  const [missionResult, setMissionResult] = useState<MissionResultData | null>(null);
  const [missionResultOpen, setMissionResultOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/student/dsa/days/${dayId}?kind=${kind}`, { credentials: 'include' });
    const json = (await res.json()) as DayPayload;
    if (!res.ok) {
      setError(json.error ?? 'Could not load level');
      setData(json);
      return;
    }
    setData(json);
    setError(null);
  }, [dayId, kind]);

  useEffect(() => {
    const problems = data?.problems ?? [];
    const problem = problems[activeProblemIdx] ?? problems[0];
    if (!problem) return;
    const langs = (data?.config?.supportedLanguages ?? ['java', 'python']).filter(isCodingLanguageId);
    const def = isCodingLanguageId(data?.config?.defaultLanguage ?? '')
      ? (data!.config!.defaultLanguage as CodingLanguageId)
      : langs[0] ?? 'java';
    setLanguage(def);
    setCode(starterFor(problem, def));
  }, [data, activeProblemIdx]);

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
        setError('Network error — could not load this day.');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [load, router]);

  const problems = data?.problems ?? [];
  const problem = problems[activeProblemIdx] ?? problems[0] ?? null;
  const mcqs = data?.mcqs ?? [];
  const mcqAnswered = mcqs.filter((m) => m.answered || m.selected).length;
  const codingPassed = problems.filter((p) => p.best?.status === 'passed').length;
  const minMcq = data?.config?.dayCompletion.minMcqAttempted ?? 5;
  const minCoding = data?.config?.dayCompletion.minCodingSolved ?? 3;
  const languages = (data?.config?.supportedLanguages ?? ['java', 'python']).filter(isCodingLanguageId);

  const dayRequirementsMet = codingPassed >= minCoding && mcqAnswered >= minMcq;
  const canOfferFinishDay =
    Boolean(missionResultOpen && missionResult) &&
    data?.status !== 'completed' &&
    dayRequirementsMet;

  const questProgress = useMemo(() => {
    const mcqPct = minMcq ? Math.round((mcqAnswered / minMcq) * 100) : 0;
    const codePct = minCoding ? Math.round((codingPassed / minCoding) * 100) : 0;
    return { mcqPct, codePct, overall: Math.round((mcqPct + codePct) / 2) };
  }, [mcqAnswered, codingPassed, minMcq, minCoding]);

  if (loading) {
    return (
      <div className="code-lab min-h-screen flex items-center justify-center">
        <p className="text-cyan-100/90 text-sm font-semibold animate-pulse">Loading Code Lab…</p>
      </div>
    );
  }

  if (data?.locked) {
    return (
      <div className="code-lab min-h-screen flex items-center justify-center px-4">
        <div className="code-lab-panel max-w-md w-full rounded-md p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Mission locked</h1>
          <p className="mt-3 text-sm text-slate-400">{data.lockReason}</p>
          <Link
            href="/dsa-arena"
            className="mt-6 inline-block rounded-md border border-cyan-400/40 bg-cyan-500/15 px-5 py-2.5 text-sm font-semibold text-cyan-50"
          >
            Back to DSA Arena
          </Link>
        </div>
      </div>
    );
  }

  if (error && !data?.day) {
    return (
      <div className="code-lab min-h-screen flex items-center justify-center px-4">
        <div className="code-lab-panel max-w-md rounded-md p-6 text-center">
          <p className="font-semibold text-rose-300">{error}</p>
          <Link href="/dsa-arena" className="mt-4 inline-block text-cyan-300 font-semibold text-sm">
            ← DSA Arena
          </Link>
        </div>
      </div>
    );
  }

  const clearMissionResult = () => {
    setMissionResultOpen(false);
  };

  const runSample = async () => {
    if (!problem) return;
    setBusy('run');
    setConsoleTab('output');
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
    setConsoleTab('output');
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
        compileOk?: boolean;
        scorePercent?: number;
        language?: string;
        publicResults?: PublicTestRow[];
      };
      if (!res.ok) {
        alert(json.error ?? 'Submission failed');
        return;
      }
      const passed = json.passed ?? 0;
      const total = json.total ?? 0;
      const status = json.status ?? 'failed';
      const snapshot: CodeLabSubmitSnapshot = {
        passed,
        total,
        status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        language: json.language ?? language,
        publicResults: json.publicResults,
      };
      setLastSubmit(snapshot);
      setPublicResults(Array.isArray(json.publicResults) ? json.publicResults : null);
      if (json.publicResults?.length) setConsoleTab('tests');
      if (status === 'passed') {
        setRunOut(`Submitted · ${passed}/${total} tests passed.`);
      } else if (json.compileOk === false) {
        setRunOut(`Compilation issue · ${passed}/${total} tests passed.`);
        setConsoleTab('errors');
      } else {
        setRunOut(`Submitted · ${passed}/${total} tests passed.`);
      }

      setMissionResult({
        problemId: problem.id,
        problemTitle: problem.title,
        passed,
        total,
        status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        language: json.language ?? language,
        publicResults: Array.isArray(json.publicResults) ? json.publicResults : undefined,
      });
      setMissionResultOpen(true);

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
        alert(json.error ?? 'Could not finish level');
        return;
      }
      if (!json.ok) {
        alert((json.reasons ?? ['Not all quests complete yet!']).join('\n'));
        return;
      }
      clearMissionResult();
      const stars =
        codingPassed >= minCoding && mcqAnswered >= minMcq ? 3 : codingPassed >= minCoding ? 2 : 1;
      setVictory({
        stars,
        message: json.nextDayNumber
          ? `Day ${json.nextDayNumber} is now on the map!`
          : 'All days done — Boss Battle (weekly assignment) awaits!',
      });
      window.setTimeout(() => router.push('/dsa-arena'), 4500);
    } finally {
      setBusy(null);
    }
  };

  const weekLabel = [data?.week?.title, data?.week?.topicName].filter(Boolean).join(' · ');

  return (
    <div className="code-lab min-h-screen pb-8">
      <DsaVictoryOverlay
        open={Boolean(victory)}
        dayNumber={data?.day?.dayNumber ?? 1}
        stars={victory?.stars ?? 3}
        message={victory?.message ?? ''}
        onClose={() => setVictory(null)}
      />

      <MissionResult
        open={missionResultOpen}
        result={missionResult}
        onBackToCodeLab={clearMissionResult}
        onReturnToArena={() => router.push('/dsa-arena')}
        showFinishDay={canOfferFinishDay}
        finishDayDisabled={busy != null}
        finishDayLabel={busy === 'complete' ? 'Finishing…' : 'Finish Day'}
        onFinishDay={() => void completeDay()}
      />

      <div
        className="mx-auto max-w-[1600px] space-y-2 px-2 py-2 sm:px-3"
        style={{ ['--cl-chrome' as string]: '12.5rem' }}
      >
        <div className="code-lab-panel code-lab-mission-bar rounded-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Day {data?.day?.dayNumber ?? '—'} · {data?.day?.title}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              MCQ {mcqAnswered}/{minMcq} · Code {codingPassed}/{minCoding} · {questProgress.overall}%
            </p>
          </div>
          <Link
            href={`/dsa/day/${dayId}/challenge${kind === 'practice' ? '?kind=practice' : ''}`}
            className="text-[11px] font-semibold text-cyan-300/80 hover:text-cyan-200"
          >
            Challenge Chamber →
          </Link>
        </div>

        <CodeLabShell
          dayTitle={data?.day?.title ?? 'Code Lab'}
          weekLabel={weekLabel}
          kind={kind}
          backHref="/dsa-arena"
          backLabel="Back to DSA Arena"
          problems={problems}
          activeProblemIdx={activeProblemIdx}
          onSelectProblem={(i) => {
            setActiveProblemIdx(i);
            const p = problems[i];
            if (p) setCode(starterFor(p, language));
            setRunOut(null);
            setLastSubmit(null);
            setPublicResults(null);
            setConsoleTab('output');
            setMissionResult(null);
            setMissionResultOpen(false);
          }}
          language={language}
          languages={languages}
          onLanguageChange={(id) => {
            setLanguage(id);
            if (problem) setCode(starterFor(problem, id));
          }}
          code={code}
          onCodeChange={setCode}
          onReset={() => {
            if (problem) setCode(starterFor(problem, language));
            setRunOut(null);
          }}
          onRun={() => void runSample()}
          onSubmit={() => void submitCode()}
          busy={busy}
          runOut={runOut}
          lastSubmit={lastSubmit}
          publicResults={publicResults}
          consoleTab={consoleTab}
          onConsoleTabChange={setConsoleTab}
          codingPassed={codingPassed}
          minCoding={minCoding}
        />

        <button
          type="button"
          disabled={busy != null || data?.status === 'completed'}
          onClick={() => void completeDay()}
          className="code-lab-btn code-lab-btn-ghost w-full py-2.5 text-sm"
        >
          {data?.status === 'completed' ? 'Day already completed' : 'Finish Day'}
        </button>
      </div>
    </div>
  );
}
