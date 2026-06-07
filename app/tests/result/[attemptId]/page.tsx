'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { formatScorePercentLabel } from '@/lib/format-score';

type AttemptStatus = {
  id: string;
  confirmed: boolean;
  status: string;
  testTitle: string;
  scorePercent: number | null;
  completedAt: string | null;
  referenceId: string;
  source: string;
  error?: string;
};

export default function TestResultPage() {
  const params = useParams();
  const attemptId = String(params?.attemptId ?? '').trim();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AttemptStatus | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/student/test-attempts/${encodeURIComponent(attemptId)}`,
        );
        const json = (await res.json().catch(() => ({}))) as AttemptStatus & { error?: string };
        if (!cancelled) {
          if (res.ok) {
            setStatus(json);
          } else {
            setStatus({
              id: attemptId,
              confirmed: false,
              status: 'unknown',
              testTitle: 'Examination',
              scorePercent: null,
              completedAt: null,
              referenceId: attemptId,
              source: 'server',
              error: json.error ?? 'Could not verify submission status.',
            });
          }
        }
      } catch {
        if (!cancelled) {
          setStatus({
            id: attemptId,
            confirmed: false,
            status: 'unknown',
            testTitle: 'Examination',
            scorePercent: null,
            completedAt: null,
            referenceId: attemptId,
            source: 'offline',
            error: 'Could not reach the server to confirm your submission.',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (loading) {
    return (
      <div className="exam-mode min-h-screen bg-white text-gray-900 flex items-center justify-center px-4">
        <p className="text-slate-600">Confirming your submission…</p>
      </div>
    );
  }

  const confirmed = status?.confirmed ?? false;

  return (
    <div className="exam-mode min-h-screen bg-white text-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1e3a5f]">
          {confirmed ? 'Exam submitted' : 'Submission status'}
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[#0c2340]">
          {confirmed ? 'Thank you.' : 'Submission could not be confirmed'}
        </h1>
        <p className="mt-2 text-slate-700">
          {confirmed
            ? 'Your response has been submitted successfully. You can now close this window.'
            : (status?.error ??
              'We could not verify this attempt on the server. If you just submitted, wait a moment and refresh.')}
        </p>
        {status?.testTitle ? (
          <p className="mt-2 text-sm text-slate-600">{status.testTitle}</p>
        ) : null}
        <p className="mt-3 text-sm font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Reference: {status?.referenceId ?? attemptId}
        </p>
        {confirmed && status?.scorePercent != null ? (
          <p className="mt-2 text-sm text-slate-600">
            Recorded score: {formatScorePercentLabel(status.scorePercent)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Student scorecards are hidden. Only admin can view detailed scorecards.
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!confirmed ? (
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Refresh status
            </Button>
          ) : (
            <Button type="button" onClick={() => window.close()}>
              Close window
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/exams">Back to examinations</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
