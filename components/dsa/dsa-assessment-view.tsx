'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getClientUser } from '@/lib/client-auth';

type Mcq = {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
};

export function DsaAssessmentView({ weekId }: { weekId: string }) {
  const router = useRouter();
  const [mcqs, setMcqs] = useState<Mcq[]>([]);
  const [title, setTitle] = useState('Weekly assessment');
  const [minPercent, setMinPercent] = useState(50);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      const res = await fetch(`/api/student/dsa/weeks/${weekId}/assessment`, { credentials: 'include' });
      const json = (await res.json()) as {
        error?: string;
        week?: { title: string };
        minPercent?: number;
        mcqs?: Mcq[];
      };
      if (!res.ok) {
        setError(json.error ?? 'Assessment is not available yet');
      } else {
        setTitle(json.week?.title ?? title);
        setMinPercent(json.minPercent ?? 50);
        setMcqs(json.mcqs ?? []);
      }
      setLoading(false);
    };
    void boot();
  }, [router, weekId, title]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/student/dsa/weeks/${weekId}/assessment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const json = (await res.json()) as {
        error?: string;
        passed?: boolean;
        percent?: number;
        reasons?: string[];
        newAttemptNumber?: number;
        title?: string;
      };
      if (!res.ok) {
        alert(json.error ?? 'Submit failed');
        return;
      }
      if (json.passed) {
        alert(`Passed (${Math.round(json.percent ?? 0)}%). ${json.title ?? 'Qualification granted.'}`);
      } else {
        alert(
          `Not passed (${Math.round(json.percent ?? 0)}%). ${(json.reasons ?? []).join(' ')} Official attempt failed. You restart at Day 1 (attempt ${json.newAttemptNumber}). History is kept.`,
        );
      }
      router.push('/dsa');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="p-8 text-sm text-slate-600">Loading assessment…</p>;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card className="p-6">
          <p className="font-semibold">Weekly assessment locked</p>
          <p className="text-sm text-slate-600 mt-2">{error}</p>
          <Button className="mt-4" asChild>
            <Link href="/dsa">Back to DSA</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
      <Link href="/dsa" className="text-sm font-semibold text-[#1e3a5f] hover:underline">
        ← DSA dashboard
      </Link>
      <h1 className="text-2xl font-bold text-[#0c2340]">{title} · weekly assessment</h1>
      <p className="text-sm text-slate-600">
        You need at least {minPercent}% to qualify for assignment attendance. Failing creates a new
        official attempt from Day 1. Previous attempts stay in history.
      </p>
      {mcqs.map((mcq, idx) => (
        <Card key={mcq.id} className="p-4">
          <p className="text-sm font-medium">
            {idx + 1}. {mcq.questionText}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={answers[mcq.id] === key ? 'default' : 'outline'}
                onClick={() => setAnswers((prev) => ({ ...prev, [mcq.id]: key }))}
              >
                {key}. {mcq[`option${key}` as 'optionA']}
              </Button>
            ))}
          </div>
        </Card>
      ))}
      <Button disabled={busy || !mcqs.length} onClick={() => void submit()}>
        Submit weekly assessment
      </Button>
      {!mcqs.length ? <Badge tone="warning">No assessment questions configured for this topic.</Badge> : null}
    </div>
  );
}
