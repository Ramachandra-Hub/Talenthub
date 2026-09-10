'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ExamProctorPanel } from '@/components/proctor/exam-proctor-panel';
import { useExamProctoring } from '@/hooks/use-exam-proctoring';
import { isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';
import { formatCodingRunOutput, runCodingOnServer } from '@/lib/coding/run-client';
import { PROCTOR_MAX_VIOLATIONS } from '@/lib/exam-v2/proctoring-config';

type LabProblem = CodeLabProblem & {
  category?: string | null;
  tags?: string[];
  studentExplanation?: string | null;
  starterCode?: Record<string, string>;
  progress?: string;
  position?: number;
  points?: number;
  best?: {
    passed: number;
    total: number;
    status: string;
    language: string;
    scorePercent?: number;
    points?: number;
  } | null;
};

type LabPayload = {
  exam: { id: string; title: string; durationMinutes: number };
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    endsAt?: string;
    solvedCount: number;
    totalScore?: number;
    maxScore: number;
  };
  problems: LabProblem[];
};

function starterFor(_problem: LabProblem | null, _language: CodingLanguageId): string {
  // Open-link hard exam: blank editor — students type their own solution.
  return '';
}

function formatRemain(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
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
  const [remainSec, setRemainSec] = useState<number | null>(null);
  const [proctorReady, setProctorReady] = useState(false);

  const proctorVideoRef = useRef<HTMLVideoElement>(null);
  const attemptIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);

  const loadLab = useCallback(async () => {
    const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/lab`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const json = await res.json();
    if (res.status === 410) {
      router.replace(`/open-coding/${examId}/result`);
      return null;
    }
    if (!res.ok) {
      setError(json.error ?? 'Failed to load coding lab');
      return null;
    }
    return json as LabPayload;
  }, [examId, router]);

  useEffect(() => {
    const boot = async () => {
      const payload = await loadLab();
      if (!payload) return;
      setData(payload);
      attemptIdRef.current = payload.attempt.id;
      setProctorReady(true);
      const initial: Record<string, string> = {};
      for (const p of payload.problems) {
        initial[`${p.id}:java`] = starterFor(p, 'java');
        initial[`${p.id}:python`] = starterFor(p, 'python');
      }
      setCodeByKey(initial);
    };
    void boot();
  }, [loadLab]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setBusy('finish');
    try {
      const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/result`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Could not finish exam');
        finishingRef.current = false;
        return;
      }
      router.replace(`/open-coding/${examId}/result`);
    } finally {
      setBusy(null);
    }
  }, [examId, router]);

  useEffect(() => {
    if (!data?.attempt.endsAt) return;
    const ends = new Date(data.attempt.endsAt).getTime();
    const tick = () => {
      const left = Math.ceil((ends - Date.now()) / 1000);
      setRemainSec(left);
      if (left <= 0) void finish();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [data?.attempt.endsAt, finish]);

  const proctorSessionId = data?.attempt.id ?? '';
  const {
    violationCount,
    tabSwitchCount,
    cameraReady,
    cameraError,
    faceNotVisible,
    autoSubmitTriggered,
    enterFullscreen,
    startCamera,
  } = useExamProctoring({
    testId: `dsa_hard_open:${examId}`,
    sessionId: proctorSessionId,
    enabled: proctorReady && Boolean(proctorSessionId),
    requireCamera: true,
    videoRef: proctorVideoRef,
    attemptIdRef,
    onMaxViolations: () => {
      void finish();
    },
  });

  useEffect(() => {
    if (autoSubmitTriggered) void finish();
  }, [autoSubmitTriggered, finish]);

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

  const clearMissionResult = () => setMissionResultOpen(false);

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
    setConsoleTab('output');
  };

  const onRun = async () => {
    if (!problem) return;
    setBusy('run');
    setConsoleTab('output');
    try {
      const sample = problem.sampleTests[0];
      const result = await runCodingOnServer(language, code, sample?.input ?? '');
      const formatted = formatCodingRunOutput(result);
      setRunOut(formatted);
      const failed =
        (result.exitCode != null && result.exitCode !== 0) ||
        Boolean(result.stderr?.trim()) ||
        Boolean(result.error?.trim());
      if (failed) setConsoleTab('errors');
    } catch (err) {
      setRunOut(err instanceof Error ? err.message : 'Run failed');
      setConsoleTab('errors');
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async () => {
    if (!problem || !data) return;
    if (!code.trim()) {
      setRunOut('Write your solution in the editor before submitting.');
      setConsoleTab('errors');
      return;
    }
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
      if (res.status === 410) {
        router.replace(`/open-coding/${examId}/result`);
        return;
      }
      if (!res.ok) {
        setRunOut(json.error ?? 'Submit failed');
        setConsoleTab('errors');
        return;
      }

      const passed = Number(json.passed ?? 0);
      const total = Number(json.total ?? 0);
      const status = String(json.status ?? 'failed');
      const points = Number(json.points ?? 0);
      const totalScore = Number(json.totalScore ?? data.attempt.totalScore ?? 0);
      const maxScore = Number(json.maxScore ?? data.attempt.maxScore ?? 100);
      setLastSubmit({
        passed,
        total,
        status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        language: json.language,
        publicResults: json.publicResults,
      });
      setPublicResults(Array.isArray(json.publicResults) ? json.publicResults : null);
      if (json.publicResults?.length) setConsoleTab('tests');
      setRunOut(
        json.compileOk === false
          ? `Compilation issue · ${passed}/${total} test cases · ${points} marks`
          : status === 'passed'
            ? `ALL TEST CASES PASSED · ${passed}/${total} · ${points} marks (exam ${totalScore}/${maxScore})`
            : `TEST CASES FAILED · ${passed}/${total} passed · ${points} marks (exam ${totalScore}/${maxScore})`,
      );
      if (json.compileOk === false) setConsoleTab('errors');
      else setConsoleTab('tests');

      setMissionResult({
        problemId: problem.id,
        problemTitle: `${problem.position ?? ''}. ${problem.title}`.replace(/^\.\s*/, ''),
        passed,
        total,
        status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        points,
        maxPoints: problem.points ?? 20,
        totalScore,
        examMaxScore: maxScore,
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
  const totalScore = Number(data?.attempt.totalScore ?? 0);
  const maxScore = Number(data?.attempt.maxScore ?? 100);

  if (error && !data) {
    return (
      <div className="code-lab flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-rose-300">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="code-lab flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Loading locked Code Lab…
      </div>
    );
  }

  return (
    <div className="code-lab min-h-screen pb-2 text-slate-100">
      <ExamProctorPanel
        videoRef={proctorVideoRef}
        violationCount={violationCount}
        maxViolations={PROCTOR_MAX_VIOLATIONS}
        tabSwitchCount={tabSwitchCount}
        cameraReady={cameraReady}
        cameraError={cameraError}
        faceNotVisible={faceNotVisible}
        autoSubmitTriggered={autoSubmitTriggered}
        onEnterFullscreen={() => void enterFullscreen()}
        onVideoMount={() => {
          void startCamera().catch(() => {
            /* handled inside hook */
          });
        }}
      />

      <MissionResult
        open={missionResultOpen}
        result={missionResult}
        onBackToCodeLab={clearMissionResult}
        onReturnToArena={() => clearMissionResult()}
        showFinishDay
        finishDayDisabled={busy != null}
        finishDayLabel={busy === 'finish' ? 'Submitting…' : 'Finish exam & view result'}
        onFinishDay={() => void finish()}
      />

      <div
        className="mx-auto max-w-[1600px] space-y-2 px-2 py-2 sm:px-3"
        style={{ ['--cl-chrome' as string]: '12.5rem' }}
      >
        <div className="code-lab-panel code-lab-mission-bar rounded-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Open-link exam · Proctored · {data.exam.durationMinutes} min
            </p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-white">{data.exam.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Solved {solvedCount}/5 · Marks {totalScore}/{maxScore} · Problem {activeIdx + 1} of{' '}
              {shellProblems.length}
            </p>
          </div>
          <div
            className={`rounded-sm border px-2.5 py-1 font-mono text-sm tabular-nums ${
              remainSec != null && remainSec <= 300
                ? 'border-rose-400/40 bg-rose-500/15 text-rose-100'
                : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
            }`}
          >
            {remainSec == null ? '--:--' : formatRemain(remainSec)}
          </div>
          <button
            type="button"
            className="code-lab-btn code-lab-btn-primary"
            disabled={busy === 'finish'}
            onClick={() => void finish()}
          >
            {busy === 'finish' ? 'Submitting…' : 'Finish exam'}
          </button>
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <CodeLabShell
          dayTitle={data.exam.title}
          weekLabel="Open-link Hard Coding"
          kind="official"
          backHref={`/open-coding/${examId}`}
          backLabel="Challenge questions"
          hideBackLink
          problemTabsBesideLanguage
          disablePaste
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
        />
      </div>
    </div>
  );
}
