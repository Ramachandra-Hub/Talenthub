'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ElevateXScorecardView } from '@/components/placement/elevatex-scorecard-view';
import type { PlacementScorecard } from '@/lib/placement/types';

export default function OpenCodingResultPage() {
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
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-rose-600">{error}</p>
        <Link href={`/open-coding/${examId}/lab`} className="mt-4 inline-block text-sm text-[#1e3a5f] underline">
          Back to coding lab
        </Link>
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-500">
        Loading full scorecard…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Hard coding open link · Immediate full result
            </p>
            <h1 className="text-xl font-bold text-[#0c2340]">
              {scorecard.candidate.examName ?? 'Exam scorecard'}
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white"
          >
            Student dashboard
          </Link>
        </div>
        <ElevateXScorecardView scorecard={scorecard} />
      </div>
    </div>
  );
}
