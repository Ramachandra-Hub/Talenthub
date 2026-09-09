'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CodeLabShell } from '@/components/student/portal/coding/code-lab-shell';
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
  contest: { id: string; slug: string; title: string; durationMinutes: number };
  attempt: { id: string; status: string; startedAt: string };
  problems: LabProblem[];
};

function starterFor(problem: LabProblem | null, language: CodingLanguageId): string {
  if (!problem) return '';
  const map = problem.starterCode ?? {};
  return map[language] || map.java || map.python || '';
}

export default function ContestLabPage() {
  const params = useParams();
  const router = useRouter();
  const contestId = String(params.contestId ?? '');

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

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/student/dsa/contests/${encodeURIComponent(contestId)}/lab`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load contest lab');
        return;
      }
      const payload = json as LabPayload;
      setData(payload);
      const initial: Record<string, string> = {};
      for (const p of payload.problems) {
        initial[`${p.id}:java`] = starterFor(p, 'java');
        initial[`${p.id}:python`] = starterFor(p, 'python');
      }
      setCodeByKey(initial);
    };
    void load();
  }, [contestId]);

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

  const onLanguageChange = (id: CodingLanguageId) => {
    setLanguage(id);
    setRunOut(null);
    setPublicResults(null);
    setLastSubmit(null);
  };

  const onSelectProblem = (idx: number) => {
    setActiveIdx(idx);
    setRunOut(null);
    setPublicResults(null);
    setLastSubmit(null);
  };

  const onReset = () => {
    if (!problem) return;
    setCode(starterFor(problem, language));
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
        `/api/student/dsa/contests/${encodeURIComponent(contestId)}/problems/${problem.id}/submit`,
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
      const snapshot: CodeLabSubmitSnapshot = {
        passed: json.passed,
        total: json.total,
        status: json.status,
        compileOk: json.compileOk,
        scorePercent: json.scorePercent,
        language: json.language,
        publicResults: json.publicResults,
      };
      setLastSubmit(snapshot);
      setPublicResults(json.publicResults ?? null);
      // refresh lab progress
      const labRes = await fetch(`/api/student/dsa/contests/${encodeURIComponent(contestId)}/lab`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (labRes.ok) setData((await labRes.json()) as LabPayload);
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
      const res = await fetch(`/api/student/dsa/contests/${encodeURIComponent(contestId)}/result`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? 'Could not finish contest');
        return;
      }
      router.push(`/dsa-arena/contest/${contestId}/result`);
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
        sampleTests: p.sampleTests,
        hiddenTestCount: p.hiddenTestCount,
        best: p.best,
        studentExplanation: p.studentExplanation,
        category: p.category,
        tags: p.tags,
      })),
    [data],
  );

  const solvedCount = (data?.problems ?? []).filter((p) => p.progress === 'solved').length;

  if (error && !data) {
    return (
      <div className="ex-portal dsa-journey flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-rose-300">{error}</p>
        <Link href="/dsa-arena/contest" className="dj-btn dj-btn-ghost">
          Back to Contests
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ex-portal dsa-journey flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Loading contest Code Lab…
      </div>
    );
  }

  return (
    <div className="ex-portal dsa-journey min-h-[100dvh] bg-[#070b14] text-slate-100">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link
              href={`/dsa-arena/contest/${contestId}`}
              className="text-[11px] font-semibold text-cyan-300/90 hover:text-cyan-200"
            >
              ← Contest brief
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
              DSA Arena Contest
            </p>
            <h1 className="text-sm font-semibold text-white">{data.contest.title}</h1>
            <p className="text-[11px] text-slate-500">
              Problem {activeIdx + 1} / {shellProblems.length} · Solved {solvedCount}/3
            </p>
          </div>
          <button
            type="button"
            className="dj-btn dj-btn-primary"
            disabled={busy === 'finish'}
            onClick={() => void finish()}
          >
            Finish Contest
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.problems.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProblem(idx)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                idx === activeIdx
                  ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40'
                  : 'bg-white/[0.05] text-slate-400'
              }`}
            >
              {p.position ?? idx + 1}. {p.progress ?? 'not_started'}
            </button>
          ))}
        </div>

        <CodeLabShell
          dayTitle={data.contest.title}
          weekLabel="Contest"
          kind="official"
          backHref={`/dsa-arena/contest/${contestId}`}
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
          minCoding={3}
        />
      </div>
    </div>
  );
}
