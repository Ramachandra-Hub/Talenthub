'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const [title, setTitle] = useState('Weekly Boss Battle');
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
        setError(json.error ?? 'Boss battle is not available yet');
      } else {
        setTitle(json.week?.title ?? 'Weekly Boss Battle');
        setMinPercent(json.minPercent ?? 50);
        setMcqs(json.mcqs ?? []);
      }
      setLoading(false);
    };
    void boot();
  }, [router, weekId]);

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
        alert(json.error ?? 'Boss survived!');
        return;
      }
      if (json.passed) {
        alert(`🏆 VICTORY! ${Math.round(json.percent ?? 0)}% — ${json.title ?? 'Assignment attendance unlocked!'}`);
      } else {
        alert(
          `💀 Defeat (${Math.round(json.percent ?? 0)}%). ${(json.reasons ?? []).join(' ')} Respawn at Day 1 — attempt ${json.newAttemptNumber}. Your history is safe.`,
        );
      }
      router.push('/dsa');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center">
        <p className="text-white font-black animate-pulse">Summoning the boss… 👹</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dsa-game-bg min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border-4 border-rose-300 bg-white/95 p-8 text-center">
          <p className="text-4xl">🛡️</p>
          <p className="font-black text-purple-900 mt-2">Boss battle locked</p>
          <p className="text-sm text-slate-600 mt-2">{error}</p>
          <Link href="/dsa" className="mt-4 inline-block rounded-2xl bg-violet-600 px-6 py-2 text-sm font-bold text-white">
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dsa-game-bg min-h-screen pb-12">
      <div className="border-b-4 border-amber-400 bg-gradient-to-r from-red-700 via-purple-700 to-indigo-800 px-4 py-6 text-center">
        <Link href="/dsa" className="text-xs font-bold text-amber-200 float-left">← Map</Link>
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Final boss</p>
        <h1 className="text-2xl font-black text-white mt-1">{title}</h1>
        <p className="text-sm font-bold text-white/85 mt-2">
          Score {minPercent}%+ to earn assignment attendance. Fail = respawn Day 1 (history kept).
        </p>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {mcqs.map((mcq, idx) => (
          <div
            key={mcq.id}
            className="rounded-2xl border-4 border-violet-300/70 bg-white/95 p-4 shadow-lg"
          >
            <p className="text-sm font-bold text-slate-800">
              {idx + 1}. {mcq.questionText}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(['A', 'B', 'C', 'D'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [mcq.id]: key }))}
                  className={`rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold ${
                    answers[mcq.id] === key
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-slate-200 bg-white hover:border-fuchsia-400'
                  }`}
                >
                  {key}. {mcq[`option${key}` as 'optionA']}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={busy || !mcqs.length}
          onClick={() => void submit()}
          className="w-full rounded-2xl border-4 border-amber-200 bg-gradient-to-r from-red-500 via-fuchsia-500 to-violet-600 py-4 text-lg font-black text-white shadow-lg disabled:opacity-50"
        >
          ⚔️ Challenge the boss
        </button>
        {!mcqs.length ? (
          <p className="text-center text-sm font-bold text-amber-200">No boss questions configured yet.</p>
        ) : null}
      </div>
    </div>
  );
}
