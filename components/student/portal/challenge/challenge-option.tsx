'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChallengeOptionKey } from '@/components/student/portal/challenge/challenge-types';

type Props = {
  optionKey: ChallengeOptionKey;
  label: string;
  selected: boolean;
  disabled: boolean;
  revealCorrect?: boolean;
  revealIncorrect?: boolean;
  isCorrectKey?: boolean;
  onSelect: () => void;
};

export function ChallengeOption({
  optionKey,
  label,
  selected,
  disabled,
  revealCorrect,
  revealIncorrect,
  isCorrectKey,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-200',
        revealCorrect &&
          'border-emerald-400/55 bg-emerald-500/15 text-emerald-50 shadow-[0_0_16px_rgba(52,211,153,0.2)]',
        revealIncorrect &&
          'border-rose-400/50 bg-rose-500/12 text-rose-50',
        !revealCorrect &&
          !revealIncorrect &&
          selected &&
          'border-cyan-300/70 bg-cyan-500/15 text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.22)]',
        !revealCorrect &&
          !revealIncorrect &&
          !selected &&
          !disabled &&
          'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-400/35 hover:bg-cyan-500/5',
        !revealCorrect &&
          !revealIncorrect &&
          disabled &&
          !selected &&
          'border-white/5 bg-white/[0.02] text-slate-500 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[12px] font-bold',
          revealCorrect && 'border-emerald-300/50 bg-emerald-500/25',
          revealIncorrect && 'border-rose-300/50 bg-rose-500/25',
          !revealCorrect && !revealIncorrect && selected && 'border-cyan-300/60 bg-cyan-500/25',
          !revealCorrect && !revealIncorrect && !selected && 'border-white/15 bg-black/20',
        )}
      >
        {revealCorrect ? <Check className="h-3.5 w-3.5" /> : null}
        {revealIncorrect ? <X className="h-3.5 w-3.5" /> : null}
        {!revealCorrect && !revealIncorrect ? optionKey : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Option {optionKey}
          {isCorrectKey && revealCorrect ? ' · Correct' : null}
          {revealIncorrect ? ' · Your answer' : null}
        </span>
        <span className="mt-0.5 block text-[14px] font-medium leading-snug">{label}</span>
      </span>
    </button>
  );
}
