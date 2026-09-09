'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export type ContestCardModel = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  problemCount: number;
  difficultyMix: string[];
  lifecycle: string;
  attempt: {
    status: string;
    totalScore: number;
    maxScore: number;
    solvedCount: number;
  } | null;
};

type Props = {
  contest: ContestCardModel;
  eligible: boolean;
  className?: string;
};

function statusLabel(contest: ContestCardModel, eligible: boolean) {
  if (!eligible) return { text: 'IV Year only', tone: 'locked' as const };
  if (contest.attempt?.status === 'submitted') {
    return { text: 'Completed', tone: 'completed' as const };
  }
  if (contest.attempt) {
    return { text: 'In Progress', tone: 'in_progress' as const };
  }
  if (contest.lifecycle === 'live') return { text: 'Available', tone: 'available' as const };
  if (contest.lifecycle === 'upcoming') return { text: 'Upcoming', tone: 'locked' as const };
  if (contest.lifecycle === 'ended') return { text: 'Ended', tone: 'locked' as const };
  return { text: contest.lifecycle, tone: 'locked' as const };
}

function ctaFor(contest: ContestCardModel, eligible: boolean) {
  if (!eligible) {
    return { href: null as string | null, label: 'Not Eligible', disabled: true };
  }
  if (contest.attempt?.status === 'submitted') {
    return {
      href: `/dsa-arena/contest/${contest.slug}/result`,
      label: 'View Result',
      disabled: false,
    };
  }
  if (contest.attempt) {
    return {
      href: `/dsa-arena/contest/${contest.slug}/lab`,
      label: 'Continue Contest',
      disabled: false,
    };
  }
  if (contest.lifecycle === 'live') {
    return {
      href: `/dsa-arena/contest/${contest.slug}`,
      label: 'Start Contest',
      disabled: false,
    };
  }
  return {
    href: `/dsa-arena/contest/${contest.slug}`,
    label: contest.lifecycle === 'upcoming' ? 'View Brief' : 'View Contest',
    disabled: false,
  };
}

export function ContestCard({ contest, eligible, className }: Props) {
  const status = statusLabel(contest, eligible);
  const cta = ctaFor(contest, eligible);
  const locked = status.tone === 'locked' && !contest.attempt;

  return (
    <article
      className={cn(
        'dj-panel rounded-md p-4',
        locked && 'opacity-70',
        status.tone === 'in_progress' && 'ring-1 ring-cyan-400/35',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400/85">
          Coding Contest
        </p>
        <span
          className={cn(
            'text-[11px] font-semibold',
            status.tone === 'completed' && 'text-emerald-300',
            status.tone === 'in_progress' && 'text-cyan-300',
            status.tone === 'available' && 'text-slate-300',
            status.tone === 'locked' && 'text-slate-500',
          )}
        >
          {status.text}
        </span>
      </div>

      <h3 className="mt-2 text-[15px] font-semibold text-white">{contest.title}</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400 line-clamp-2">
        {contest.description || 'Solve three coding challenges in Java or Python.'}
      </p>

      <p className="mt-3 text-[11px] text-slate-500">
        {contest.problemCount || 3} problems · {contest.durationMinutes} min ·{' '}
        {contest.difficultyMix.join(' · ') || 'mixed'}
      </p>

      {contest.attempt ? (
        <p className="mt-2 text-[11px] tabular-nums text-slate-400">
          Score {contest.attempt.totalScore}/{contest.attempt.maxScore} · Solved{' '}
          {contest.attempt.solvedCount}/3
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-cyan-200/90">Server graded</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Java · Python
        </span>
      </div>

      {cta.disabled || !cta.href ? (
        <button type="button" className="dj-btn dj-btn-ghost mt-4 w-full" disabled>
          {cta.label}
        </button>
      ) : (
        <Link
          href={cta.href}
          className={cn(
            'dj-btn mt-4 w-full',
            contest.attempt?.status === 'submitted' ? 'dj-btn-ghost' : 'dj-btn-primary',
          )}
        >
          {cta.label}
        </Link>
      )}
    </article>
  );
}
