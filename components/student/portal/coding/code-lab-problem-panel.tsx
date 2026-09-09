'use client';

import type { CodeLabProblem } from '@/components/student/portal/coding/code-lab-types';

type Props = {
  problem: CodeLabProblem;
  /** Expand all sections in-flow (no nested scroll clip). Used by contest Code Lab. */
  expandAll?: boolean;
};

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="text-[12px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

export function CodeLabProblemPanel({ problem, expandAll = false }: Props) {
  const tags = problem.tags?.length ? problem.tags.join(', ') : null;

  return (
    <div
      className={
        expandAll
          ? 'code-lab-panel code-lab-problem-document rounded-sm'
          : 'code-lab-panel flex h-full min-h-0 flex-col overflow-hidden rounded-sm'
      }
    >
      <div className="shrink-0 border-b border-white/[0.06] px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Problem</p>
        <h2 className="mt-0.5 text-[13px] font-semibold leading-snug text-white">{problem.title}</h2>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
          <dt className="text-slate-500">Difficulty</dt>
          <dd className="text-slate-300 capitalize">{problem.difficulty || '—'}</dd>
          <dt className="text-slate-500">Category</dt>
          <dd className="text-slate-300">{problem.category || problem.conceptSlug || '—'}</dd>
          {tags ? (
            <>
              <dt className="text-slate-500">Tags</dt>
              <dd className="text-slate-300">{tags}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <div
        className={
          expandAll
            ? 'space-y-3 px-2.5 py-2.5 text-[12px] leading-relaxed text-slate-300'
            : 'min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 py-2 text-[12px] leading-relaxed text-slate-300'
        }
      >
        <Section label="Problem Statement">
          <p className="whitespace-pre-wrap text-slate-200">{problem.statement}</p>
        </Section>

        {problem.constraints ? (
          <Section label="Constraints">
            <p className="whitespace-pre-wrap text-slate-400">{problem.constraints}</p>
          </Section>
        ) : null}

        <Section label="Input Format">
          <p className="whitespace-pre-wrap text-slate-400">{problem.inputFormat || '—'}</p>
        </Section>

        <Section label="Output Format">
          <p className="whitespace-pre-wrap text-slate-400">{problem.outputFormat || '—'}</p>
        </Section>

        {problem.sampleTests.length ? (
          <Section label="Sample Input / Output">
            <div className="space-y-2">
              {problem.sampleTests.slice(0, 3).map((t, i) => (
                <div
                  key={i}
                  className="grid gap-2 border border-white/[0.06] bg-black/25 p-2 font-mono text-[11px] sm:grid-cols-2"
                >
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">Sample Input</p>
                    <pre className="mt-0.5 whitespace-pre-wrap text-cyan-100/90">
                      {t.input || '(empty)'}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">Sample Output</p>
                    <pre className="mt-0.5 whitespace-pre-wrap text-emerald-100/90">
                      {t.expectedOutput || '(empty)'}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <Section label="Explanation">
          {problem.studentExplanation ? (
            <p className="whitespace-pre-wrap text-slate-400">{problem.studentExplanation}</p>
          ) : (
            <p className="text-slate-500">Explanation unavailable for this sample.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
