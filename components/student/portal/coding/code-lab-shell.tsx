'use client';

import Link from 'next/link';
import { CodeEditor } from '@/components/coding/code-editor';
import { CodeLabConsole } from '@/components/student/portal/coding/code-lab-console';
import { CodeLabProblemPanel } from '@/components/student/portal/coding/code-lab-problem-panel';
import { CodeLabTests } from '@/components/student/portal/coding/code-lab-tests';
import type {
  CodeLabConsoleTab,
  CodeLabProblem,
  CodeLabSubmitSnapshot,
  PublicTestRow,
} from '@/components/student/portal/coding/code-lab-types';
import type { CodingLanguageId } from '@/lib/coding/languages';
import { cn } from '@/lib/utils';

type Props = {
  dayTitle: string;
  weekLabel: string;
  kind: 'official' | 'practice';
  backHref: string;
  problems: CodeLabProblem[];
  activeProblemIdx: number;
  onSelectProblem: (idx: number) => void;
  language: CodingLanguageId;
  languages: CodingLanguageId[];
  onLanguageChange: (id: CodingLanguageId) => void;
  code: string;
  onCodeChange: (value: string) => void;
  onReset: () => void;
  onRun: () => void;
  onSubmit: () => void;
  busy: string | null;
  runOut: string | null;
  lastSubmit: CodeLabSubmitSnapshot | null;
  publicResults: PublicTestRow[] | null;
  consoleTab: CodeLabConsoleTab;
  onConsoleTabChange: (tab: CodeLabConsoleTab) => void;
  codingPassed: number;
  minCoding: number;
};

export function CodeLabShell({
  dayTitle,
  weekLabel,
  kind,
  backHref,
  problems,
  activeProblemIdx,
  onSelectProblem,
  language,
  languages,
  onLanguageChange,
  code,
  onCodeChange,
  onReset,
  onRun,
  onSubmit,
  busy,
  runOut,
  lastSubmit,
  publicResults,
  consoleTab,
  onConsoleTabChange,
  codingPassed,
  minCoding,
}: Props) {
  const problem = problems[activeProblemIdx] ?? null;

  return (
    <section id="code-lab" className="scroll-mt-4 space-y-3" aria-label="Code Lab">
      <header className="code-lab-panel rounded-md px-4 py-3">
        <Link
          href={backHref}
          className="text-[11px] font-semibold text-cyan-300/90 hover:text-cyan-200"
        >
          ← Back to DSA Arena
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400/80">
              Code mission
            </p>
            <h1 className="mt-1 text-lg font-semibold text-white sm:text-xl">
              {problem?.title ?? dayTitle}
            </h1>
            <p className="mt-1 text-[11px] text-slate-400">
              {weekLabel}
              {problem ? ` · ${problem.difficulty}` : ''}
              {kind === 'practice' ? ' · Practice' : ''}
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300">
              Solved {codingPassed}/{minCoding}
            </p>
            {problem?.best ? (
              <p className="mt-0.5">
                Best {problem.best.passed}/{problem.best.total} · {problem.best.status}
              </p>
            ) : null}
          </div>
        </div>

        {problems.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Problems">
            {problems.map((p, i) => {
              const solved = p.best?.status === 'passed';
              const current = i === activeProblemIdx;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={current}
                  aria-label={`Problem ${i + 1}${solved ? ', solved' : ''}`}
                  onClick={() => onSelectProblem(i)}
                  className={cn(
                    'min-w-[2.5rem] rounded-sm border px-2.5 py-1.5 text-[11px] font-bold tabular-nums transition-colors',
                    current && 'border-cyan-400/50 bg-cyan-500/15 text-cyan-50',
                    !current && solved && 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
                    !current && !solved && 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20',
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                  {solved ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      {!problem ? (
        <p className="code-lab-panel rounded-md px-4 py-6 text-sm text-slate-400">
          No coding problems for this day.
        </p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)_minmax(0,0.9fr)] lg:items-stretch">
            <div className="min-h-[280px] max-h-[min(70vh,640px)] lg:min-h-[480px]">
              <CodeLabProblemPanel problem={problem} />
            </div>

            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Language
                </span>
                {languages.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onLanguageChange(id)}
                    className={cn(
                      'rounded-sm border px-2.5 py-1 text-[11px] font-semibold capitalize',
                      language === id
                        ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-50'
                        : 'border-white/10 bg-white/[0.03] text-slate-400',
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
              <div className="code-lab-editor-wrap rounded-md flex-1">
                <CodeEditor language={language} value={code} onChange={onCodeChange} height="480px" />
              </div>
            </div>

            <div className="min-h-[200px] max-h-[min(70vh,640px)] lg:min-h-[480px]">
              <CodeLabTests
                sampleCount={problem.sampleTests.length}
                hiddenTestCount={problem.hiddenTestCount}
                publicResults={publicResults}
                best={problem.best}
                lastSubmit={lastSubmit}
              />
            </div>
          </div>

          <CodeLabConsole
            tab={consoleTab}
            onTabChange={onConsoleTabChange}
            runOut={runOut}
            busy={busy}
            publicResults={publicResults}
            lastSubmit={lastSubmit}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="code-lab-btn code-lab-btn-ghost"
              disabled={busy != null}
              onClick={onReset}
              aria-label="Reset code to starter"
            >
              Reset
            </button>
            <button
              type="button"
              className="code-lab-btn code-lab-btn-primary"
              disabled={busy != null}
              onClick={onRun}
              aria-label="Run code against sample input"
            >
              {busy === 'run' ? 'Running…' : 'Run Code'}
            </button>
            <button
              type="button"
              className="code-lab-btn code-lab-btn-submit"
              disabled={busy != null}
              onClick={onSubmit}
              aria-label="Submit solution for grading"
            >
              {busy === 'submit' ? 'Submitting…' : 'Submit Solution'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
