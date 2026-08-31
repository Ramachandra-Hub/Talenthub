'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getClientUser } from '@/lib/client-auth';

type History = {
  attempts: Array<{
    id: string;
    weekTitle: string;
    weekNumber: number;
    attemptNumber: number;
    kind: string;
    status: string;
    assessmentPercent: number | null;
    startedAt: string;
    completedAt: string | null;
  }>;
  qualifications: Array<{ id: string; title: string; status: string; weekTitle: string; createdAt: string }>;
  submissions: Array<{
    id: string;
    problemTitle: string;
    language: string;
    status: string;
    passed: number;
    total: number;
    kind: string;
    createdAt: string;
  }>;
};

export function DsaHistoryView() {
  const router = useRouter();
  const [data, setData] = useState<History | null>(null);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      const res = await fetch('/api/student/dsa/history', { credentials: 'include' });
      if (res.ok) setData((await res.json()) as History);
    };
    void boot();
  }, [router]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <Link href="/dsa" className="text-sm font-semibold text-[#1e3a5f] hover:underline">
        ← DSA dashboard
      </Link>
      <h1 className="text-2xl font-bold text-[#0c2340]">DSA progress history</h1>
      {!data ? <p className="text-sm text-slate-600">Loading…</p> : null}

      <Card className="p-5">
        <h2 className="font-semibold">Qualifications</h2>
        {!data?.qualifications.length ? (
          <p className="text-sm text-slate-500 mt-2">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.qualifications.map((q) => (
              <li key={q.id} className="flex justify-between gap-2 text-sm">
                <span>{q.title}</span>
                <Badge tone="success">{q.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Official and practice attempts</h2>
        {!data?.attempts.length ? (
          <p className="text-sm text-slate-500 mt-2">No attempts yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {data.attempts.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2">
                {a.weekTitle} · {a.kind} attempt {a.attemptNumber} · {a.status}
                {a.assessmentPercent != null ? ` · ${Math.round(a.assessmentPercent)}%` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Recent code submissions</h2>
        {!data?.submissions.length ? (
          <p className="text-sm text-slate-500 mt-2">No submissions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {data.submissions.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 px-3 py-2">
                {s.problemTitle} · {s.language} · {s.passed}/{s.total} · {s.status} · {s.kind}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
