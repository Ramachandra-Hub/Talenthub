'use client';

import { useCallback, useState } from 'react';
import { fetchElevateXScorecardForAdmin } from '@/lib/admin/fetch-elevatex-scorecard-client';
import type { PlacementScorecard } from '@/lib/placement/types';

export type ElevateXScorecardModalTarget = {
  attemptId: string;
  studentName: string;
  rollNumber?: string;
};

async function tryBackfillScorecard(attemptId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/elevatex/backfill-scorecard', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useElevateXScorecardModal() {
  const [target, setTarget] = useState<ElevateXScorecardModalTarget | null>(null);
  const [scorecard, setScorecard] = useState<PlacementScorecard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const close = useCallback(() => {
    setTarget(null);
    setScorecard(null);
    setLoadError(null);
    setLoading(false);
  }, []);

  const open = useCallback(async (next: ElevateXScorecardModalTarget) => {
    setTarget(next);
    setScorecard(null);
    setLoadError(null);
    setLoading(true);
    try {
      let result = await fetchElevateXScorecardForAdmin(next.attemptId);
      if ('error' in result) {
        const backfilled = await tryBackfillScorecard(next.attemptId);
        if (backfilled) {
          result = await fetchElevateXScorecardForAdmin(next.attemptId);
        }
      }
      if ('error' in result) {
        setLoadError(
          `${result.error} If the student submitted while online, click Full report again — the server will try to recover the scorecard automatically.`,
        );
        return;
      }
      setScorecard(result.scorecard);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    open,
    close,
    loading,
    loadError,
    target,
    scorecard,
    isOpen: target != null,
  };
}
