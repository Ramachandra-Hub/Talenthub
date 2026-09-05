'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicTestRow } from '@/components/student/portal/coding/code-lab-types';

type Props = {
  sampleCount: number;
  hiddenTestCount: number;
  publicResults: PublicTestRow[] | null;
  best: { passed: number; total: number; status: string } | null;
  lastSubmit: { passed: number; total: number; status: string } | null;
};

export function CodeLabTests({
  sampleCount,
  hiddenTestCount,
  publicResults,
  best,
  lastSubmit,
}: Props) {
  const rows = publicResults;
  const summary = lastSubmit ?? (best ? { passed: best.passed, total: best.total, status: best.status } : null);

  return (
    <div className="code-lab-panel flex h-full min-h-0 flex-col rounded-md">
      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Test cases</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {sampleCount} sample · {hiddenTestCount} hidden
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {rows && rows.length > 0 ? (
          rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px]',
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
              <div className="min-w-0">
                <p className="font-semibold">
                  Test {i + 1} · {row.passed ? 'Passed' : 'Failed'}
                </p>
                {!row.passed && row.stderr ? (
                  <p className="mt-1 break-words font-mono text-[10px] text-rose-100/80">{row.stderr}</p>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="text-[12px] leading-relaxed text-slate-500">
            Run Code uses the first sample input. Submit Solution grades all tests (including hidden).
          </p>
        )}
      </div>

      {summary ? (
        <div
          className={cn(
            'border-t border-white/[0.06] px-3 py-2.5 text-[12px] font-semibold',
            summary.status === 'passed'
              ? 'bg-emerald-500/10 text-emerald-100'
              : 'bg-white/[0.02] text-slate-300',
          )}
        >
          {summary.passed} / {summary.total} passed
          {summary.status === 'passed' ? ' · Solved' : ''}
        </div>
      ) : null}
    </div>
  );
}
