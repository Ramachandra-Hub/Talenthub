'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CodeEditor } from '@/components/coding/code-editor';
import { DsaVictoryOverlay } from '@/components/dsa/dsa-victory-overlay';
import { getClientUser } from '@/lib/client-auth';
import { CODING_LANGUAGES, isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';
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

const LANG_LABELS: Record<string, string> = {
  java: '☕ Java',
  python: '🐍 Python',
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
        setError('Network glitch — the gummy servers hiccuped.');
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

  const questProgress = useMemo(() => {
    const mcqPct = minMcq ? Math.round((mcqAnswered / minMcq) * 100) : 0;
    const codePct = minCoding ? Math.round((codingPassed / minCoding) * 100) : 0;
    return { mcqPct, codePct, overall: Math.round((mcqPct + codePct) / 2) };
  }, [mcqAnswered, codingPassed, minMcq, minCoding]);

  if (loading) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center">
        <p className="text-white font-black text-lg animate-pulse">Loading level… 🍬</p>
      </div>
    );
  }

  if (data?.locked) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border-4 border-slate-300 bg-white/95 p-8 text-center shadow-xl">
          <p className="text-5xl mb-3">🔒</p>
          <h1 className="text-2xl font-black text-purple-900">Level locked!</h1>
          <p className="mt-3 text-sm font-semibold text-slate-600">{data.lockReason}</p>
          <Link
            href="/dsa"
            className="mt-6 inline-block rounded-2xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white"
          >
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  if (error && !data?.day) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl bg-white p-6 text-center">
          <p className="font-bold text-rose-600">{error}</p>
          <Link href="/dsa" className="mt-4 inline-block text-violet-700 font-bold">
            ← Map
          </Link>
        </div>
      </div>
    );
  }

  const submitMcq = async (mcqId: string, selected: string) => {
    setBusy(`mcq-${mcqId}`);
    try {
      const res = await fetch('/api/student/dsa/mcq', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcqId, selected }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(json.error ?? 'Could not lock in answer');
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const runSample = async () => {
    if (!problem) return;
    setBusy('run');
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
    try {
      const res = await fetch('/api/student/dsa/code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: problem.id, language, sourceCode: code }),
      });
      const json = (await res.json()) as { error?: string; passed?: number; total?: number; status?: string };
      if (!res.ok) {
        alert(json.error ?? 'Boss survived your attack!');
        return;
      }
      if (json.status === 'passed') {
        setRunOut(`🎉 Boss defeated! ${json.passed}/${json.total} tests passed.`);
      } else {
        setRunOut(`💪 Keep going! ${json.passed}/${json.total} tests passed.`);
      }
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
      const stars =
        codingPassed >= minCoding && mcqAnswered >= minMcq ? 3 : codingPassed >= minCoding ? 2 : 1;
      setVictory({
        stars,
        message: json.nextDayNumber
          ? `Day ${json.nextDayNumber} is now on the map!`
          : 'All days done — Boss Battle (weekly assignment) awaits!',
      });
      window.setTimeout(() => router.push('/dsa'), 4500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dsa-game-bg min-h-screen pb-12">
      <DsaVictoryOverlay
        open={Boolean(victory)}
        dayNumber={data?.day?.dayNumber ?? 1}
        stars={victory?.stars ?? 3}
        message={victory?.message ?? ''}
        onClose={() => setVictory(null)}
      />

      <div className="border-b-4 border-amber-300/50 bg-gradient-to-r from-indigo-700 via-purple-600 to-pink-600 px-4 py-5">
        <Link href="/dsa" className="text-xs font-bold text-amber-200 hover:text-white">
          ← Adventure map
        </Link>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mt-2">
          {data?.week?.title} · {data?.week?.topicName}
        </p>
        <h1 className="text-2xl font-black text-white mt-1">{data?.day?.title}</h1>
        {kind === 'practice' ? (
          <span className="inline-block mt-2 text-[10px] font-bold bg-amber-400/90 text-amber-950 px-2 py-0.5 rounded-full">
            Practice mode — scores don&apos;t bite
          </span>
        ) : null}

        <div className="mt-4 rounded-2xl bg-black/20 border border-white/20 p-3">
          <div className="flex justify-between text-[10px] font-black uppercase text-amber-200 mb-1">
            <span>Quest progress</span>
            <span>{questProgress.overall}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-400 transition-all duration-500"
              style={{ width: `${questProgress.overall}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[11px] font-bold text-white/90">
            <span>🍬 MCQs {mcqAnswered}/{minMcq}</span>
            <span>💻 Code {codingPassed}/{minCoding}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        <section className="rounded-3xl border-4 border-pink-300/80 bg-gradient-to-b from-pink-100 to-rose-50 p-5 shadow-lg">
          <h2 className="text-lg font-black text-rose-900 flex items-center gap-2">
            <span>🍬</span> Brain Candy — {minMcq} MCQs
          </h2>
          <p className="text-xs font-semibold text-rose-700/80 mt-1">
            Pick your answer. We won&apos;t tell you if you&apos;re right — that&apos;s the suspense! 😏
          </p>
          {!mcqs.length ? (
            <p className="text-sm text-slate-500 mt-3">No MCQs in this level.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {mcqs.map((mcq, idx) => (
                <li
                  key={mcq.id}
                  className={`rounded-2xl border-2 p-4 transition-colors ${
                    mcq.selected
                      ? 'border-violet-400 bg-violet-50/80'
                      : 'border-rose-200 bg-white/80'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-800">
                    {idx + 1}. {mcq.questionText}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(['A', 'B', 'C', 'D'] as const).map((key) => {
                      const label =
                        key === 'A'
                          ? mcq.optionA
                          : key === 'B'
                            ? mcq.optionB
                            : key === 'C'
                              ? mcq.optionC
                              : mcq.optionD;
                      const picked = mcq.selected === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={Boolean(mcq.selected) || busy === `mcq-${mcq.id}`}
                          onClick={() => void submitMcq(mcq.id, key)}
                          className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                            picked
                              ? 'border-violet-500 bg-violet-500 text-white shadow-md'
                              : mcq.selected
                                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'border-rose-200 bg-white hover:border-fuchsia-400 hover:scale-[1.02] active:scale-95'
                          }`}
                        >
                          <span className="font-black">{key}.</span> {label}
                        </button>
                      );
                    })}
                  </div>
                  {mcq.selected ? (
                    <p className="text-xs font-bold text-violet-600 mt-2">✓ Locked in — no take-backs!</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border-4 border-sky-300/80 bg-gradient-to-b from-sky-100 to-cyan-50 p-5 shadow-lg space-y-4">
          <h2 className="text-lg font-black text-sky-900 flex items-center gap-2">
            <span>👾</span> Code Bosses — {minCoding} problems
          </h2>
          {problems.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {problems.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveProblemIdx(i);
                    setCode(starterFor(p, language));
                    setRunOut(null);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black border-2 transition-all ${
                    i === activeProblemIdx
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : p.best?.status === 'passed'
                        ? 'border-lime-500 bg-lime-100 text-lime-800'
                        : 'border-sky-200 bg-white text-sky-800'
                  }`}
                >
                  {p.best?.status === 'passed' ? '✓ ' : ''}
                  Boss {i + 1}
                </button>
              ))}
            </div>
          ) : null}

          {!problem ? (
            <p className="text-sm text-slate-500">No coding bosses today.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-sky-950">{problem.title}</h3>
                {problem.best?.status === 'passed' ? (
                  <span className="dsa-tick-animate inline-flex items-center gap-1 rounded-full bg-lime-500 text-white text-xs font-black px-2.5 py-1">
                    ✓ Defeated
                  </span>
                ) : problem.best ? (
                  <span className="text-xs font-bold text-amber-700">
                    {problem.best.passed}/{problem.best.total} tests
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{problem.statement}</p>
              <p className="text-[11px] font-bold text-sky-700/70">
                {problem.conceptSlug} · {problem.difficulty} · {problem.hiddenTestCount} secret tests 👀
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-black uppercase text-slate-500">Weapon</span>
                {languages.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setLanguage(id);
                      if (problem) setCode(starterFor(problem, id));
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-black border-2 ${
                      language === id
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {LANG_LABELS[id] ?? id}
                  </button>
                ))}
              </div>
              <CodeEditor language={language} value={code} onChange={setCode} height="280px" />
              {runOut ? (
                <pre className="text-xs bg-slate-900 text-lime-300 rounded-xl p-3 overflow-auto max-h-36 font-mono">
                  {runOut}
                </pre>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void runSample()}
                  className="rounded-xl border-2 border-sky-400 bg-white px-4 py-2 text-sm font-bold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                >
                  Test strike
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void submitCode()}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-black text-white shadow-md hover:scale-105 disabled:opacity-50"
                >
                  Submit attack ⚔️
                </button>
              </div>
            </>
          )}
        </section>

        <button
          type="button"
          disabled={busy != null || data?.status === 'completed'}
          onClick={() => void completeDay()}
          className="w-full rounded-2xl border-4 border-amber-200 bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 py-4 text-lg font-black text-amber-950 shadow-[0_6px_0_rgba(180,83,9,0.45)] hover:translate-y-0.5 disabled:opacity-50 disabled:shadow-none transition-all"
        >
          {data?.status === 'completed' ? '✓ Level already crushed' : '🏁 Finish level & claim stars'}
        </button>
      </div>
    </div>
  );
}
