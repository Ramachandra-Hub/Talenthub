'use client';

import { Progress } from '@/components/ui/progress';
import { formatScorePercent } from '@/lib/format-score';
import type { CodingDeepAnalysis } from '@/lib/exam-v2/coding-rubric';

type Props = {
  analysis: CodingDeepAnalysis;
  compact?: boolean;
};

export function CodingDeepAnalysisView({ analysis, compact }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-bold text-slate-900 mb-1">Coding deep analysis</h4>
        <p className="text-xs text-slate-500">
          Parameter-wise marks out of 100 — test cases, logic, complexity, quality, and stability.
        </p>
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold text-slate-900">Overall coding score</p>
          <p className="text-lg font-bold text-[#0c2340] tabular-nums">
            {formatScorePercent(analysis.aggregate.totalEarned)} / {analysis.aggregate.totalMax}
          </p>
        </div>
        <div className="space-y-2">
          {analysis.aggregate.parameters.map((param) => (
            <ParameterRow key={param.id} label={param.label} earned={param.earned} max={param.maxPoints} />
          ))}
        </div>
      </div>

      {analysis.perQuestion.length > 1 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Per-question breakdown
          </p>
          {analysis.perQuestion.map((row) => (
            <div key={row.questionId} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                <p className="text-sm font-bold text-[#0c2340] tabular-nums">
                  {formatScorePercent(row.rubric.totalEarned)} / {row.rubric.totalMax}
                </p>
              </div>
              <div className={compact ? 'grid sm:grid-cols-2 gap-2' : 'space-y-2'}>
                {row.rubric.parameters.map((param) => (
                  <ParameterRow
                    key={param.id}
                    label={param.label}
                    earned={param.earned}
                    max={param.maxPoints}
                    compact
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ParameterRow({
  label,
  earned,
  max,
  compact,
}: {
  label: string;
  earned: number;
  max: number;
  compact?: boolean;
}) {
  const percent = max > 0 ? Math.round((earned / max) * 100) : 0;
  return (
    <div className={compact ? 'rounded bg-slate-50 px-2 py-1.5' : ''}>
      <div className="flex justify-between gap-2 text-xs text-slate-700 mb-1">
        <span className="min-w-0">{label}</span>
        <span className="font-semibold tabular-nums shrink-0">
          {formatScorePercent(earned)} / {max}
        </span>
      </div>
      <Progress value={percent} className="h-1" />
    </div>
  );
}
