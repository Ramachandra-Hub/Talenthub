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
  /** Contest / exam: show full problem document without nested scroll clip. */
  expandProblemDocument?: boolean;
  hideMissionChrome?: boolean;
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
  expandProblemDocument = false,
  hideMissionChrome = false,
}: Props) {
  const problem = problems[activeProblemIdx] ?? null;
  const missionMeta = [
    problem?.difficulty,
    problem?.category || problem?.conceptSlug,
    weekLabel || null,
    kind === 'practice' ? 'Practice' : null,
  ]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();

  return (
    <section id="code-lab" className="code-lab-shell scroll-mt-2" aria-label="Code Lab">
      {!hideMissionChrome ? (
        <header className="code-lab-panel code-lab-mission-bar shrink-0 rounded-sm">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <Link
                href={backHref}
                className="text-[11px] font-semibold text-cyan-300/90 hover:text-cyan-200"
              >
                ← Back to DSA Arena
              </Link>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-400/85">
                Code mission
              </p>
              {problems.length > 0 ? (
                <p className="text-[10px] font-semibold tabular-nums text-slate-400">
                  Mission {String(activeProblemIdx + 1).padStart(2, '0')} /{' '}
                  {String(problems.length).padStart(2, '0')}
                </p>
              ) : null}
              <p className="text-[10px] font-semibold text-slate-400">
                Solved {codingPassed}/{minCoding}
              </p>
            </div>
            <h1 className="mt-0.5 truncate text-[14px] font-semibold leading-tight text-white">
              {problem?.title ?? dayTitle}
            </h1>
            {missionMeta ? (
              <p className="mt-0.5 text-[10px] font-medium tracking-wide text-slate-500">
                {missionMeta}
              </p>
            ) : null}
          </div>

          {problems.length > 1 ? (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Problems">
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
                      'min-w-[2.1rem] rounded-sm border px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition-colors',
                      current && 'border-cyan-400/50 bg-cyan-500/15 text-cyan-50',
                      !current &&
                        solved &&
                        'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
                      !current &&
                        !solved &&
                        'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20',
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
      ) : null}

      {!problem ? (
        <p className="code-lab-panel rounded-sm px-3 py-5 text-sm text-slate-400">
          No coding problems for this day.
        </p>
      ) : (
        <>
          {expandProblemDocument ? (
            <CodeLabProblemPanel problem={problem} expandAll />
          ) : null}

          <div
            className={cn(
              'code-lab-workspace',
              expandProblemDocument && 'code-lab-workspace--contest',
            )}
          >
            {!expandProblemDocument ? <CodeLabProblemPanel problem={problem} /> : null}

            <div className="code-lab-editor-col">
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Language
                </span>
                {languages.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onLanguageChange(id)}
                    className={cn(
                      'rounded-sm border px-2 py-0.5 text-[11px] font-semibold capitalize',
                      language === id
                        ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-50'
                        : 'border-white/10 bg-white/[0.03] text-slate-400',
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
              <div className="code-lab-editor-wrap rounded-sm">
                <CodeEditor
                  language={language}
                  value={code}
                  onChange={onCodeChange}
                  fill
                  fontSize={17}
                  className="code-lab-monaco-host"
                />
              </div>
            </div>

            <CodeLabTests
              sampleTests={problem.sampleTests}
              hiddenTestCount={problem.hiddenTestCount}
              publicResults={publicResults}
              best={problem.best}
              lastSubmit={lastSubmit}
              busy={busy}
              hasRunOutput={Boolean(runOut?.trim())}
            />
          </div>

          <div className="shrink-0 space-y-1.5">
            <CodeLabConsole
              tab={consoleTab}
              onTabChange={onConsoleTabChange}
              runOut={runOut}
              busy={busy}
              publicResults={publicResults}
              lastSubmit={lastSubmit}
            />

            <div className="code-lab-action-bar rounded-sm">
              <p className="text-[11px] font-semibold tabular-nums text-slate-400">
                Problem {String(activeProblemIdx + 1).padStart(2, '0')} /{' '}
                {String(Math.max(problems.length, 1)).padStart(2, '0')}
              </p>
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
            </div>
          </div>
        </>
      )}
    </section>
  );
}
