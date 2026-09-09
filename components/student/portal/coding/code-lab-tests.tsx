'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicTestRow } from '@/components/student/portal/coding/code-lab-types';

type Sample = { input: string; expectedOutput: string };

type Props = {
  sampleTests: Sample[];
  hiddenTestCount: number;
  publicResults: PublicTestRow[] | null;
  best: { passed: number; total: number; status: string } | null;
  lastSubmit: { passed: number; total: number; status: string } | null;
  busy: string | null;
  hasRunOutput?: boolean;
};

export function CodeLabTests({
  sampleTests,
  hiddenTestCount,
  publicResults,
  best,
  lastSubmit,
  busy,
  hasRunOutput = false,
}: Props) {
  const rows = publicResults;
  const summary = lastSubmit ?? (best ? { passed: best.passed, total: best.total, status: best.status } : null);

  let statusText = 'Not executed';
  if (busy === 'run') statusText = 'Running…';
  else if (busy === 'submit') statusText = 'Submitting…';
  else if (summary?.status === 'passed') statusText = 'Passed';
  else if (summary?.status === 'failed') statusText = 'Failed';
  else if (rows && rows.length) statusText = 'Results ready';
  else if (hasRunOutput) statusText = 'Sample run complete';

  return (
    <div className="code-lab-panel flex h-full min-h-0 flex-col overflow-hidden rounded-sm">
      <div className="shrink-0 border-b border-white/[0.06] px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Test cases</p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          {sampleTests.length} sample · {hiddenTestCount} hidden
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 py-2 text-[12px]">
        {rows && rows.length > 0 ? (
          <div className="space-y-1.5">
            {rows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 border px-2 py-1.5',
                  row.passed
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                    : 'border-rose-400/25 bg-rose-500/10 text-rose-100',
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
                      Test {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] font-semibold">
                      {row.passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  {!row.passed && row.stderr ? (
                    <p className="mt-1 break-words font-mono text-[10px] text-rose-100/80">{row.stderr}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {sampleTests.slice(0, 2).map((t, i) => (
              <div key={i} className="border border-white/[0.06] bg-black/20">
                <p className="border-b border-white/[0.05] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-400/80">
                  Sample {String(i + 1).padStart(2, '0')}
                </p>
                <div className="space-y-1.5 px-2 py-1.5 font-mono text-[11px]">
                  <div>
                    <p className="text-[9px] uppercase text-slate-500">Input</p>
                    <pre className="mt-0.5 whitespace-pre-wrap text-cyan-100/90">{t.input || '(empty)'}</pre>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-slate-500">Expected</p>
                    <pre className="mt-0.5 whitespace-pre-wrap text-emerald-100/90">
                      {t.expectedOutput || '(empty)'}
                    </pre>
                  </div>
                </div>
              </div>
            ))}

            {hiddenTestCount > 0 ? (
              <div className="border-t border-white/[0.06] pt-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Hidden tests
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{hiddenTestCount} hidden</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</p>
        <p className="mt-0.5 text-[12px] font-semibold text-slate-200">{statusText}</p>
        {summary ? (
          <p
            className={cn(
              'mt-1 text-[12px] font-semibold',
              summary.status === 'passed' ? 'text-emerald-300' : 'text-slate-300',
            )}
          >
            {summary.passed} / {summary.total}{' '}
            {summary.status === 'passed' ? 'PASSED' : 'passed'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
