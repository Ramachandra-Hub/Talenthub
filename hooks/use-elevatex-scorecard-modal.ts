'use client';

import { useCallback, useState } from 'react';
import { fetchElevateXScorecardForAdmin } from '@/lib/admin/fetch-elevatex-scorecard-client';
import type { PlacementScorecard } from '@/lib/placement/types';

export type ElevateXScorecardModalTarget = {
  attemptId: string;
  studentName: string;
  rollNumber?: string;
};

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
      const result = await fetchElevateXScorecardForAdmin(next.attemptId);
      if ('error' in result) {
        setLoadError(result.error);
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
