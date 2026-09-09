'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Coins, Zap } from 'lucide-react';
import type { ChallengeQuestion, ChallengeSessionMeta } from '@/components/student/portal/challenge/challenge-types';

type Props = {
  meta: ChallengeSessionMeta;
  questions: ChallengeQuestion[];
  onRetry?: () => void;
};

export function ChallengeResults({ meta, questions, onRetry }: Props) {
  const answered = questions.filter((q) => q.answered || q.selected).length;
  const withFeedback = questions.filter((q) => q.feedback);
  const correct =
    withFeedback.length > 0
      ? withFeedback.filter((q) => q.feedback?.isCorrect).length
      : null;
  const xpEarned =
    meta.mode === 'learning' && correct != null
      ? correct * (questions[0]?.xpReward ?? 20)
      : answered * Math.round((questions[0]?.xpReward ?? 20) * 0.5);
  const coinsEarned =
    meta.mode === 'learning' && correct != null
      ? correct * (questions[0]?.coinReward ?? 5)
      : answered * Math.round((questions[0]?.coinReward ?? 5) * 0.5);

  return (
    <div className="ex-portal flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="ex-panel w-full max-w-lg rounded-xl p-6 sm:p-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/90">
          Challenge complete
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white sm:text-[28px]">{meta.title}</h1>
        <p className="mt-2 text-[13px] text-slate-400">{meta.topicName} · Day {meta.dayNumber}</p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Answered</p>
            <p className="mt-1 text-lg font-bold text-white">
              {answered}/{questions.length}
            </p>
          </div>
          <div className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-200/80">XP</p>
            <p className="mt-1 inline-flex items-center justify-center gap-1 text-lg font-bold text-amber-100">
              <Zap className="h-4 w-4" /> +{xpEarned}
            </p>
          </div>
          <div className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-3">
            <p className="text-[10px] uppercase tracking-wider text-cyan-200/80">Coins</p>
            <p className="mt-1 inline-flex items-center justify-center gap-1 text-lg font-bold text-cyan-100">
              <Coins className="h-4 w-4" /> +{coinsEarned}
            </p>
          </div>
        </div>

        {correct != null ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            {correct} correct · {questions.length - correct} to review
          </p>
        ) : (
          <p className="mt-4 text-[13px] text-slate-400">
            Answers locked in. Keep momentum in the Code Lab.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={meta.codeLabHref} className="ex-btn-primary">
            Continue to Code Lab <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link href={meta.arenaHref} className="ex-btn-ghost">
            Back to DSA Arena
          </Link>
        </div>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-3 text-[12px] text-slate-500 hover:text-slate-300">
            Review questions
          </button>
        ) : null}
      </div>
    </div>
  );
}
