'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContestsPortalFrame } from '@/components/student/portal/contests/contests-portal-frame';
import { ElevateXScorecardView } from '@/components/placement/elevatex-scorecard-view';
import type { PlacementScorecard } from '@/lib/placement/types';

export default function OpenCodingResultPage() {
  return (
    <ContestsPortalFrame title="HARD CODING" subtitle="ElevateX scorecard">
      <ResultBody />
    </ContestsPortalFrame>
  );
}

function ResultBody() {
  const params = useParams();
  const examId = String(params.examId ?? '');
  const [scorecard, setScorecard] = useState<PlacementScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/result`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Failed to load result');
          return;
        }
        setScorecard(json.scorecard as PlacementScorecard);
      } catch {
        setError('Failed to load result');
      }
    };
    void load();
  }, [examId]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <Link href={`/open-coding/${examId}`} className="ex-btn-ghost">
          ← Back to challenge brief
        </Link>
      </div>
    );
  }

  if (!scorecard) {
    return <p className="text-sm text-slate-400">Loading full ElevateX scorecard…</p>;
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
            Immediate full result · ElevateX type
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white">
            {scorecard.candidate.examName ?? 'Exam scorecard'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/open-coding/${examId}`} className="ex-btn-ghost">
            Challenge brief
          </Link>
          <Link href="/dashboard" className="ex-btn-primary">
            Student dashboard
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white p-3 sm:p-4">
        <ElevateXScorecardView scorecard={scorecard} />
      </div>
    </div>
  );
}
