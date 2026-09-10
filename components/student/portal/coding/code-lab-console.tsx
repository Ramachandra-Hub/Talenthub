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
  const hasOutput = Boolean(runOut?.trim()) || busy === 'run' || busy === 'submit';
  const hasTests = Boolean((publicResults && publicResults.length) || lastSubmit);
  const errorText = deriveErrorText(runOut, lastSubmit);
  const hasErrors = Boolean(errorText);

  const tabs: Array<{ id: CodeLabConsoleTab; label: string; show: boolean }> = [
    { id: 'output', label: 'Output', show: true },
    { id: 'tests', label: 'Tests', show: hasTests },
    { id: 'errors', label: 'Errors', show: hasErrors },
  ];

  let body = 'Idle — type your code, then Run Code or Submit Solution.';
  if (busy === 'run') body = 'Running…';
  else if (busy === 'submit') body = 'Grading test cases…';
  else if (tab === 'output') body = runOut?.trim() || body;
  else if (tab === 'errors') body = errorText || 'No errors reported.';
  else if (tab === 'tests') {
    if (publicResults && publicResults.length) {
      body = publicResults
        .map(
          (r, i) =>
            `Test case ${String(i + 1).padStart(2, '0')}: ${r.passed ? 'PASSED' : 'FAILED'}${
              r.stderr ? `\n  ${r.stderr}` : ''
            }`,
        )
        .join('\n\n');
      if (lastSubmit) {
        const allOk = lastSubmit.status === 'passed';
        body += `\n\n———\n${lastSubmit.passed}/${lastSubmit.total} test cases — ${
          allOk ? 'ALL PASSED' : 'FAILED'
        }`;
      }
    } else if (lastSubmit) {
      body = `${lastSubmit.passed}/${lastSubmit.total} test cases — ${
        lastSubmit.status === 'passed' ? 'ALL PASSED' : 'FAILED'
      }`;
    } else {
      body = 'Submit Solution to see test case results.';
    }
  }

  const statusLabel = deriveStatusLabel(busy, runOut, lastSubmit);
  const active = hasOutput || hasTests || hasErrors || Boolean(busy);

  return (
    <div className="code-lab-panel overflow-hidden rounded-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-1.5">
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
            'mr-1.5 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
            statusLabel.tone === 'ok' && 'bg-emerald-500/15 text-emerald-200',
            statusLabel.tone === 'err' && 'bg-rose-500/15 text-rose-200',
            statusLabel.tone === 'busy' && 'bg-cyan-500/15 text-cyan-200',
            statusLabel.tone === 'idle' && 'bg-white/5 text-slate-500',
          )}
        >
          {statusLabel.text}
        </span>
      </div>
      <pre className={cn('code-lab-console-body', active && 'is-active')} aria-live="polite">
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
  if (lastSubmit?.status === 'passed') return { text: 'Test cases PASSED', tone: 'ok' };
  if (lastSubmit?.status === 'failed') return { text: 'Test cases FAILED', tone: 'err' };
  if (runOut && /timeout/i.test(runOut)) return { text: 'Timeout', tone: 'err' };
  if (runOut && /error|exception|failed/i.test(runOut)) return { text: 'Error', tone: 'err' };
  if (runOut) return { text: 'Output', tone: 'idle' };
  return { text: 'Idle', tone: 'idle' };
}
