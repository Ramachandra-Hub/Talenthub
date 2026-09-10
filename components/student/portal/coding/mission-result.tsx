'use client';

import { Check, X } from 'lucide-react';
import type { PublicTestRow } from '@/components/student/portal/coding/code-lab-types';
import { cn } from '@/lib/utils';

export type MissionResultData = {
  problemId: string;
  problemTitle: string;
  passed: number;
  total: number;
  status: string;
  compileOk?: boolean;
  scorePercent?: number;
  /** Marks earned for this problem (e.g. 20). */
  points?: number;
  /** Max marks for this problem. */
  maxPoints?: number;
  /** Running exam total after this submit. */
  totalScore?: number;
  examMaxScore?: number;
  language?: string;
  publicResults?: PublicTestRow[];
};

type Props = {
  open: boolean;
  result: MissionResultData | null;
  onBackToCodeLab: () => void;
  onReturnToArena: () => void;
  showFinishDay?: boolean;
  finishDayDisabled?: boolean;
  finishDayLabel?: string;
  onFinishDay?: () => void;
  /** Hide Return to Arena (open-link exams). */
  hideReturnToArena?: boolean;
  /** Label for the primary dismiss button. */
  continueLabel?: string;
};

export function MissionResult({
  open,
  result,
  onBackToCodeLab,
  onReturnToArena,
  showFinishDay,
  finishDayDisabled,
  finishDayLabel = 'Finish Day',
  onFinishDay,
  hideReturnToArena = false,
  continueLabel = 'Back to Code Lab',
}: Props) {
  if (!open || !result) return null;

  const passed = result.status === 'passed';
  const compileFail = result.compileOk === false;
  const rows = result.publicResults ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#02060c]/78 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-result-title"
    >
      <div className="mission-result-panel w-full max-w-lg overflow-hidden rounded-md border border-white/[0.1] bg-[#0a1220] shadow-[0_0_40px_rgba(34,211,238,0.08)]">
        <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Mission result
          </p>
          <h2 id="mission-result-title" className="mt-1 text-lg font-semibold text-white">
            {result.problemTitle}
          </h2>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div
            className={cn(
              'rounded-sm border px-3 py-2.5',
              passed && 'border-emerald-400/30 bg-emerald-500/10',
              !passed && compileFail && 'border-amber-400/30 bg-amber-500/10',
              !passed && !compileFail && 'border-rose-400/30 bg-rose-500/10',
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
            <p
              className={cn(
                'mt-0.5 text-[15px] font-semibold',
                passed && 'text-emerald-200',
                !passed && compileFail && 'text-amber-100',
                !passed && !compileFail && 'text-rose-100',
              )}
            >
              {passed
                ? 'All test cases PASSED'
                : compileFail
                  ? 'Compilation error'
                  : 'Test case(s) FAILED'}
            </p>
            <p className="mt-1 text-[12px] tabular-nums text-slate-300">
              {result.passed}/{result.total} test cases passed
              {typeof result.points === 'number'
                ? ` · ${result.points}/${result.maxPoints ?? result.points} marks`
                : ''}
            </p>
          </div>

          {rows.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Test results
              </p>
              <ul className="mt-2 space-y-1.5">
                {rows.map((row, i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-start gap-2 border px-2.5 py-1.5 text-[12px]',
                      row.passed
                        ? 'border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-100'
                        : 'border-rose-400/20 bg-rose-500/[0.07] text-rose-100',
                    )}
                  >
                    {row.passed ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : (
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      Test case {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      {row.passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {row.passed ? 'Test case passed' : 'Test case failed'}
                  </p>
                      {!row.passed && row.stderr ? (
                        <p className="mt-1 break-words font-mono text-[10px] text-rose-100/75">
                          {row.stderr}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
            {result.language ? (
              <div className="border border-white/[0.06] bg-black/20 px-2.5 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Language
                </p>
                <p className="mt-0.5 font-semibold capitalize text-slate-200">{result.language}</p>
              </div>
            ) : null}
            <div className="border border-white/[0.06] bg-black/20 px-2.5 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Status</p>
              <p className="mt-0.5 font-semibold capitalize text-slate-200">{result.status}</p>
            </div>
            {typeof result.points === 'number' ? (
              <div className="border border-white/[0.06] bg-black/20 px-2.5 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Marks</p>
                <p className="mt-0.5 font-semibold tabular-nums text-slate-200">
                  {result.points}/{result.maxPoints ?? 20}
                </p>
              </div>
            ) : typeof result.scorePercent === 'number' ? (
              <div className="border border-white/[0.06] bg-black/20 px-2.5 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Score</p>
                <p className="mt-0.5 font-semibold tabular-nums text-slate-200">
                  {Math.round(result.scorePercent)}%
                </p>
              </div>
            ) : null}
          </div>

          {typeof result.totalScore === 'number' ? (
            <p className="text-[12px] tabular-nums text-cyan-100/90">
              Exam total: {result.totalScore}/{result.examMaxScore ?? 100} marks
            </p>
          ) : null}

          <p className="text-[11px] leading-relaxed text-slate-500">
            {passed
              ? 'This problem is solved. Marks are saved to your exam scorecard.'
              : 'Review the public tests, adjust your code, and submit again. Best score is kept.'}
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-3 sm:flex-row sm:flex-wrap sm:px-5">
          <button
            type="button"
            className="code-lab-btn code-lab-btn-primary sm:flex-1"
            onClick={onBackToCodeLab}
          >
            {continueLabel}
          </button>
          {!hideReturnToArena ? (
            <button
              type="button"
              className="code-lab-btn code-lab-btn-ghost sm:flex-1"
              onClick={onReturnToArena}
            >
              Return to Arena
            </button>
          ) : null}
          {showFinishDay ? (
            <button
              type="button"
              className="code-lab-btn code-lab-btn-submit w-full sm:w-auto"
              disabled={finishDayDisabled}
              onClick={onFinishDay}
            >
              {finishDayLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
