'use client';

import type { CodeLabProblem } from '@/components/student/portal/coding/code-lab-types';

type Props = {
  problem: CodeLabProblem;
};

export function CodeLabProblemPanel({ problem }: Props) {
  return (
    <div className="code-lab-panel flex h-full min-h-0 flex-col overflow-hidden rounded-sm">
      <div className="shrink-0 border-b border-white/[0.06] px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Problem</p>
        <h2 className="mt-0.5 text-[13px] font-semibold leading-snug text-white">{problem.title}</h2>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
          {problem.difficulty}
          {problem.conceptSlug ? ` · ${problem.conceptSlug}` : ''}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 py-2 text-[12px] leading-relaxed text-slate-300">
        <section>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Statement
          </p>
          <p className="whitespace-pre-wrap text-slate-200">{problem.statement}</p>
        </section>

        {problem.sampleTests.length ? (
          <section>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Examples
            </p>
            <div className="space-y-1.5">
              {problem.sampleTests.slice(0, 3).map((t, i) => (
                <div key={i} className="border border-white/[0.06] bg-black/25 p-2 font-mono text-[11px]">
                  <p className="text-[9px] uppercase text-slate-500">Input</p>
                  <pre className="mt-0.5 whitespace-pre-wrap text-cyan-100/90">{t.input || '(empty)'}</pre>
                  <p className="mt-1.5 text-[9px] uppercase text-slate-500">Expected</p>
                  <pre className="mt-0.5 whitespace-pre-wrap text-emerald-100/90">
                    {t.expectedOutput || '(empty)'}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            I/O format
          </p>
          <p className="text-slate-400">
            <span className="text-slate-500">Input:</span> {problem.inputFormat || '—'}
          </p>
          <p className="mt-1 text-slate-400">
            <span className="text-slate-500">Output:</span> {problem.outputFormat || '—'}
          </p>
        </section>

        {problem.constraints ? (
          <section>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Constraints
            </p>
            <p className="whitespace-pre-wrap text-slate-400">{problem.constraints}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
