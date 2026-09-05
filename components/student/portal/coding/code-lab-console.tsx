'use client';

import { cn } from '@/lib/utils';
import type { CodeLabConsoleTab, PublicTestRow } from '@/components/student/portal/coding/code-lab-types';

type Props = {
  tab: CodeLabConsoleTab;
  onTabChange: (tab: CodeLabConsoleTab) => void;
  runOut: string | null;
  busy: string | null;
  publicResults: PublicTestRow[] | null;
  lastSubmit: { passed: number; total: number; status: string; compileOk?: boolean } | null;
};

export function CodeLabConsole({
  tab,
  onTabChange,
  runOut,
  busy,
  publicResults,
  lastSubmit,
}: Props) {
  const hasTests = Boolean(publicResults && publicResults.length);
  const errorText = deriveErrorText(runOut, lastSubmit);
  const hasErrors = Boolean(errorText);

  const tabs: Array<{ id: CodeLabConsoleTab; label: string; show: boolean }> = [
    { id: 'output', label: 'Output', show: true },
    { id: 'tests', label: 'Tests', show: hasTests },
    { id: 'errors', label: 'Errors', show: hasErrors },
  ];

  let body = 'Ready. Click Run Code to execute against the first sample input.';
  if (busy === 'run') body = 'Running…';
  else if (busy === 'submit') body = 'Submitting…';
  else if (tab === 'output') body = runOut?.trim() || body;
  else if (tab === 'errors') body = errorText || 'No errors reported.';
  else if (tab === 'tests' && publicResults) {
    body = publicResults
      .map((r, i) => `Test ${i + 1}: ${r.passed ? 'Passed' : 'Failed'}${r.stderr ? ` — ${r.stderr}` : ''}`)
      .join('\n');
  }

  const statusLabel = deriveStatusLabel(busy, runOut, lastSubmit);

  return (
    <div className="code-lab-panel rounded-md overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-2">
        <div className="flex" role="tablist" aria-label="Console panels">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="code-lab-tab"
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
              </button>
            ))}
        </div>
        <span
          className={cn(
            'mr-2 rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            statusLabel.tone === 'ok' && 'bg-emerald-500/15 text-emerald-200',
            statusLabel.tone === 'err' && 'bg-rose-500/15 text-rose-200',
            statusLabel.tone === 'busy' && 'bg-cyan-500/15 text-cyan-200',
            statusLabel.tone === 'idle' && 'bg-white/5 text-slate-400',
          )}
        >
          {statusLabel.text}
        </span>
      </div>
      <pre
        className="max-h-40 overflow-auto bg-[#060d16] px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap"
        aria-live="polite"
      >
        {body}
      </pre>
    </div>
  );
}

function deriveErrorText(
  runOut: string | null,
  lastSubmit: { compileOk?: boolean; status: string } | null,
): string | null {
  if (lastSubmit?.compileOk === false) {
    return 'Compilation failed on one or more tests. Check stderr in Output.';
  }
  if (!runOut) return null;
  const lower = runOut.toLowerCase();
  if (
    lower.includes('error') ||
    lower.includes('timeout') ||
    lower.includes('failed') ||
    lower.includes('exception')
  ) {
    return runOut;
  }
  return null;
}

function deriveStatusLabel(
  busy: string | null,
  runOut: string | null,
  lastSubmit: { status: string; compileOk?: boolean } | null,
): { text: string; tone: 'idle' | 'busy' | 'ok' | 'err' } {
  if (busy === 'run') return { text: 'Running', tone: 'busy' };
  if (busy === 'submit') return { text: 'Submitting', tone: 'busy' };
  if (lastSubmit?.compileOk === false) return { text: 'Compile error', tone: 'err' };
  if (lastSubmit?.status === 'passed') return { text: 'Passed', tone: 'ok' };
  if (lastSubmit?.status === 'failed') return { text: 'Failed', tone: 'err' };
  if (runOut && /timeout/i.test(runOut)) return { text: 'Timeout', tone: 'err' };
  if (runOut && /error|exception|failed/i.test(runOut)) return { text: 'Error', tone: 'err' };
  if (runOut) return { text: 'Output ready', tone: 'idle' };
  return { text: 'Idle', tone: 'idle' };
}
