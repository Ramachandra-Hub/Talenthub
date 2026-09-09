'use client';

import { cn } from '@/lib/utils';
import { Flag } from 'lucide-react';

export type NavigatorCellState =
  | 'current'
  | 'answered'
  | 'unanswered'
  | 'marked'
  | 'correct'
  | 'incorrect';

type Props = {
  total: number;
  currentIndex: number;
  getState: (index: number) => NavigatorCellState;
  onSelect: (index: number) => void;
  disabled?: boolean;
};

export function QuestionNavigator({ total, currentIndex, getState, onSelect, disabled }: Props) {
  return (
    <div role="navigation" aria-label="Question navigator" className="flex flex-wrap gap-2">
      {Array.from({ length: total }, (_, i) => {
        const state = getState(i);
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(i)}
            aria-current={state === 'current' ? 'true' : undefined}
            aria-label={`Question ${n}, ${state}`}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-md border text-[12px] font-bold tabular-nums transition-all duration-200',
              state === 'current' &&
                'border-cyan-300 bg-cyan-500/25 text-cyan-50 shadow-[0_0_14px_rgba(34,211,238,0.35)]',
              state === 'answered' && 'border-sky-400/40 bg-sky-500/15 text-sky-100',
              state === 'correct' && 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100',
              state === 'incorrect' && 'border-rose-400/45 bg-rose-500/15 text-rose-100',
              state === 'unanswered' &&
                'border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25 hover:text-slate-200',
              state === 'marked' && 'border-amber-400/50 bg-amber-500/15 text-amber-100',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {n}
            {state === 'marked' ? (
              <Flag className="absolute -right-1 -top-1 h-2.5 w-2.5 text-amber-300" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
