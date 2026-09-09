'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getClientUser } from '@/lib/client-auth';
import { PortalSidebar } from '@/components/student/portal/portal-sidebar';
import { ChallengeChamber } from '@/components/student/portal/challenge/challenge-chamber';
import {
  adaptDayMcqsToChallenge,
  type ChallengeOptionKey,
  type ChallengeQuestion,
  type ChallengeSessionMeta,
  type McqSubmitResponse,
} from '@/components/student/portal/challenge/challenge-types';

type DayPayload = {
  locked?: boolean;
  lockReason?: string;
  kind?: string;
  week?: { id: string; title: string; topicName: string };
  day?: { id: string; dayNumber: number; title: string };
  mcqs?: Array<{
    id: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    difficulty?: string;
    conceptSlug?: string;
    selected: string | null;
    answered: boolean;
  }>;
  error?: string;
};

export function ChallengeChamberPage({ dayId }: { dayId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const kind = search.get('kind') === 'practice' ? 'practice' : 'official';
  /** Learning shows feedback after lock; assessment hides keys (default for official). */
  const modeParam = search.get('mode');
  const mode =
    modeParam === 'assessment' ? 'assessment' : modeParam === 'learning' ? 'learning' : 'learning';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ reason: string } | null>(null);
  const [meta, setMeta] = useState<ChallengeSessionMeta | null>(null);
  const [questions, setQuestions] = useState<ChallengeQuestion[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/student/dsa/days/${dayId}?kind=${kind}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const json = (await res.json()) as DayPayload;
    if (!res.ok) {
      setError(json.error ?? 'Could not load challenge');
      return;
    }
    if (json.locked) {
      setLocked({ reason: json.lockReason ?? 'This day is locked.' });
      return;
    }

    const qs = adaptDayMcqsToChallenge(json.mcqs ?? []);
    setQuestions(qs);
    setMeta({
      title: `${(json.week?.topicName ?? 'DSA').toUpperCase()} CHALLENGE`,
      subtitle: json.day?.title ?? 'Brain Candy checkpoint',
      topicName: json.week?.topicName ?? 'DSA',
      dayId,
      dayNumber: json.day?.dayNumber ?? 1,
      backHref: `/dsa/day/${dayId}${kind === 'practice' ? '?kind=practice' : ''}`,
      codeLabHref: `/dsa/day/${dayId}${kind === 'practice' ? '?kind=practice' : ''}#code-lab`,
      arenaHref: '/dsa-arena',
      mode,
      totalXp: qs.reduce((s, q) => s + q.xpReward, 0),
      totalCoins: qs.reduce((s, q) => s + q.coinReward, 0),
    });
  }, [dayId, kind, mode]);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        await load();
      } catch {
        setError('Network error loading challenge.');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [load, router]);

  const onSubmitAnswer = async (
    questionId: string,
    selected: ChallengeOptionKey,
  ): Promise<McqSubmitResponse> => {
    const res = await fetch('/api/student/dsa/mcq', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcqId: questionId,
        selected,
        revealFeedback: mode === 'learning',
      }),
    });
    const json = (await res.json()) as McqSubmitResponse;
    if (!res.ok) {
      return { error: json.error ?? 'Could not save answer' };
    }
    return json;
  };

  if (loading) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Entering Challenge Chamber…
      </div>
    );
  }

  if (locked) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center px-4">
        <div className="ex-panel max-w-md rounded-xl p-6 text-center">
          <p className="text-lg font-semibold text-white">Chamber locked</p>
          <p className="mt-2 text-sm text-slate-400">{locked.reason}</p>
          <Link href="/dsa-arena" className="ex-btn-primary mt-4 inline-flex">
            Back to DSA Arena
          </Link>
        </div>
      </div>
    );
  }

  if (error || !meta || !questions) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center px-4">
        <div className="ex-panel max-w-md rounded-xl p-6 text-center">
          <p className="text-lg font-semibold text-white">Unable to load</p>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <Link href="/dsa-arena" className="ex-btn-primary mt-4 inline-flex">
            Back to DSA Arena
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <PortalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <ChallengeChamber
        key={`${dayId}-${kind}-${questions.map((q) => q.id).join(',')}`}
        meta={meta}
        initialQuestions={questions}
        onSubmitAnswer={onSubmitAnswer}
        onOpenNav={() => setSidebarOpen(true)}
      />
    </>
  );
}
