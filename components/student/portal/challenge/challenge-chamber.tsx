'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Coins,
  Eraser,
  Flag,
  Loader2,
  Menu,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionNavigator } from '@/components/student/portal/challenge/question-navigator';
import { ChallengeOption } from '@/components/student/portal/challenge/challenge-option';
import { ChallengeResults } from '@/components/student/portal/challenge/challenge-results';
import {
  navigatorStatus,
  type ChallengeOptionKey,
  type ChallengeQuestion,
  type ChallengeSessionMeta,
  type McqSubmitResponse,
} from '@/components/student/portal/challenge/challenge-types';

type Props = {
  meta: ChallengeSessionMeta;
  initialQuestions: ChallengeQuestion[];
  onSubmitAnswer: (
    questionId: string,
    selected: ChallengeOptionKey,
  ) => Promise<McqSubmitResponse>;
  onOpenNav?: () => void;
};

export function ChallengeChamber({ meta, initialQuestions, onSubmitAnswer, onOpenNav }: Props) {
  const [questions, setQuestions] = useState<ChallengeQuestion[]>(initialQuestions);
  const [index, setIndex] = useState(0);
  const [pendingKey, setPendingKey] = useState<ChallengeOptionKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'challenge' | 'results'>('challenge');

  const current = questions[index] ?? null;
  const answeredCount = questions.filter((q) => q.answered || q.selected).length;
  const progressPct = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;
  const allDone = questions.length > 0 && answeredCount >= questions.length;

  const locked = Boolean(current?.answered || current?.selected || current?.feedback);

  const syncPending = useMemo(() => {
    if (!current) return null;
    if (current.selected) return current.selected;
    return pendingKey;
  }, [current, pendingKey]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= questions.length) return;
      setIndex(i);
      setPendingKey(null);
      setError(null);
    },
    [questions.length],
  );

  const toggleMark = () => {
    if (!current) return;
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === current.id ? { ...q, markedForReview: !q.markedForReview } : q,
      ),
    );
  };

  const clearLocal = () => {
    if (!current || locked) return;
    setPendingKey(null);
  };

  const lockAnswer = async () => {
    if (!current || !syncPending || locked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmitAnswer(current.id, syncPending);
      if (res.error) {
        setError(res.error);
        return;
      }

      const feedback =
        meta.mode === 'learning' && typeof res.isCorrect === 'boolean' && res.correctAnswer
          ? {
              isCorrect: res.isCorrect,
              correctAnswer: res.correctAnswer as ChallengeOptionKey,
              explanation: res.explanation ?? null,
            }
          : null;

      setQuestions((prev) =>
        prev.map((q) =>
          q.id === current.id
            ? {
                ...q,
                selected: syncPending,
                answered: true,
                feedback,
              }
            : q,
        ),
      );
      setPendingKey(null);
    } catch {
      setError('Could not lock answer. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const nextOrFinish = () => {
    if (index < questions.length - 1) {
      goTo(index + 1);
      return;
    }
    if (allDone || answeredCount === questions.length) {
      setPhase('results');
    }
  };

  if (phase === 'results') {
    return (
      <ChallengeResults
        meta={meta}
        questions={questions}
        onRetry={() => {
          setPhase('challenge');
          setIndex(0);
        }}
      />
    );
  }

  if (!current) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        No challenges assigned for this mission.
      </div>
    );
  }

  const showFeedback = meta.mode === 'learning' && current.feedback;

  return (
    <div className="ex-portal challenge-chamber min-h-[100dvh]">
      <div className="ex-portal-mist" aria-hidden />
      <div className="relative z-[1] lg:pl-[196px]">
        {/* slim top bar — portal sidebar is optional parent; chamber works standalone */}
        <header className="border-b border-white/[0.06] bg-[#050b14]/85 px-4 py-3.5 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {onOpenNav ? (
                  <button
                    type="button"
                    className="lg:hidden rounded-md border border-white/10 p-2 text-slate-300 hover:bg-white/5"
                    onClick={onOpenNav}
                    aria-label="Open navigation"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                ) : null}
                <Link
                  href={meta.backHref}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 transition-colors hover:text-cyan-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Mission
                </Link>
              </div>
              <h1 className="mt-1.5 text-[18px] font-bold tracking-wide text-white sm:text-[22px]">
                {meta.title}
              </h1>
              <p className="text-[12px] text-slate-400">{meta.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 font-semibold text-amber-100">
                <Zap className="mr-1 inline h-3 w-3" />
                +{current.xpReward} XP
              </span>
              <span className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 font-semibold text-cyan-100">
                <Coins className="mr-1 inline h-3 w-3" />
                +{current.coinReward} Coins
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-semibold text-slate-300">
                Q {current.questionNumber} / {questions.length}
              </span>
            </div>
          </div>
          <div className="mx-auto mt-3 max-w-[1400px]">
            <div className="ex-progress">
              <span style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <main className="min-w-0">
            <article className="ex-panel rounded-xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-sm border border-white/10 bg-white/5 px-2 py-0.5 font-bold uppercase tracking-wider text-slate-300">
                  {meta.mode === 'learning' ? 'Learning' : 'Assessment'}
                </span>
                {current.difficulty ? (
                  <span className="rounded-sm border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 font-semibold text-violet-200">
                    {current.difficulty}
                  </span>
                ) : null}
                {current.topic ? (
                  <span className="rounded-sm border border-white/10 px-2 py-0.5 text-slate-400">
                    {current.topic}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-4 text-[17px] font-semibold leading-relaxed text-white sm:text-[18px]">
                {current.text}
              </h2>

              <div className="mt-5 space-y-2.5" role="group" aria-label="Answer options">
                {current.options.map((opt) => {
                  const isSelected = syncPending === opt.key;
                  const revealCorrect = Boolean(
                    showFeedback && current.feedback?.correctAnswer === opt.key,
                  );
                  const revealIncorrect = Boolean(
                    showFeedback &&
                      !current.feedback?.isCorrect &&
                      current.feedback?.correctAnswer !== opt.key &&
                      current.selected === opt.key,
                  );
                  return (
                    <ChallengeOption
                      key={opt.key}
                      optionKey={opt.key}
                      label={opt.label}
                      selected={isSelected}
                      disabled={locked || busy}
                      revealCorrect={revealCorrect}
                      revealIncorrect={revealIncorrect}
                      isCorrectKey={current.feedback?.correctAnswer === opt.key}
                      onSelect={() => setPendingKey(opt.key)}
                    />
                  );
                })}
              </div>

              {showFeedback ? (
                <div
                  className={cn(
                    'mt-5 rounded-lg border px-4 py-3 text-left',
                    current.feedback?.isCorrect
                      ? 'border-emerald-400/35 bg-emerald-500/10'
                      : 'border-rose-400/30 bg-rose-500/10',
                  )}
                  role="status"
                >
                  <p className="text-[13px] font-bold text-white">
                    {current.feedback?.isCorrect ? 'Correct' : 'Not quite'}
                  </p>
                  {current.feedback?.isCorrect ? (
                    <p className="mt-1 text-[12px] text-emerald-100/90">
                      +{current.xpReward} XP · +{current.coinReward} Coins
                    </p>
                  ) : (
                    <p className="mt-1 text-[12px] text-rose-100/90">
                      Your answer: {current.selected} · Correct: {current.feedback?.correctAnswer}
                    </p>
                  )}
                  {current.feedback?.explanation ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-200">
                      {current.feedback.explanation}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="mt-4 text-[13px] font-medium text-rose-300" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={toggleMark}
                  className={cn(
                    'ex-btn-ghost',
                    current.markedForReview && 'border-amber-400/40 text-amber-100',
                  )}
                >
                  {current.markedForReview ? (
                    <Flag className="h-3.5 w-3.5" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                  )}
                  {current.markedForReview ? 'Marked' : 'Mark for Review'}
                </button>
                <button
                  type="button"
                  onClick={clearLocal}
                  disabled={locked || !pendingKey}
                  className="ex-btn-ghost disabled:opacity-40"
                >
                  <Eraser className="h-3.5 w-3.5" /> Clear
                </button>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => goTo(index - 1)}
                    disabled={index === 0}
                    className="ex-btn-ghost disabled:opacity-40"
                  >
                    Previous
                  </button>
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => void lockAnswer()}
                      disabled={!syncPending || busy}
                      className="ex-btn-primary disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Lock Answer
                    </button>
                  ) : (
                    <button type="button" onClick={nextOrFinish} className="ex-btn-primary">
                      {index >= questions.length - 1 && (allDone || answeredCount === questions.length)
                        ? 'Finish Challenge'
                        : 'Next Challenge'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          </main>

          <aside className="space-y-3.5 xl:sticky xl:top-4 xl:self-start">
            <div className="ex-panel rounded-lg p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Question HUD
              </p>
              <p className="mt-2 text-[13px] font-semibold text-white">
                {answeredCount} / {questions.length} locked
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{progressPct}% complete</p>
              <div className="mt-4">
                <QuestionNavigator
                  total={questions.length}
                  currentIndex={index}
                  disabled={busy}
                  getState={(i) => navigatorStatus(questions[i]!, i === index)}
                  onSelect={goTo}
                />
              </div>
              <ul className="mt-4 space-y-1 text-[10px] text-slate-500">
                <li>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-400/80" /> Current
                </li>
                <li>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-500/70" /> Answered
                </li>
                <li>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400/80" /> Marked
                </li>
                {meta.mode === 'learning' ? (
                  <>
                    <li>
                      <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400/80" />{' '}
                      Correct
                    </li>
                    <li>
                      <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400/80" /> Incorrect
                    </li>
                  </>
                ) : null}
              </ul>
            </div>

            {allDone ? (
              <button type="button" onClick={() => setPhase('results')} className="ex-btn-primary w-full">
                View Results <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
