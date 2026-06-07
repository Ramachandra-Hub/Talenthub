'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  COMPETITIVE_ALL_INDIA_MINUTES,
  COMPETITIVE_ALL_INDIA_QUESTIONS,
} from '@/lib/constants';
import { COMPETITIVE_SESSION_SEED_KEY } from '@/lib/competitive-exam/exam-definition';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getClientUser } from '@/lib/client-auth';

export default function CompetitiveExamLandingPage() {
  const router = useRouter();

  const begin = async () => {
    const user = await getClientUser();
    if (!user?.id) {
      router.push('/auth/login/student?redirect=/tests/competitive-exam');
      return;
    }

    const localSeed =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const res = await fetchWithAuth('/api/student/competitive-exam/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: localSeed }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      alert(json.error ?? 'Could not start your competitive exam session. Try again.');
      return;
    }

    const json = (await res.json()) as { seed?: string };
    const seed = json.seed?.trim() || localSeed;
    sessionStorage.setItem(COMPETITIVE_SESSION_SEED_KEY, seed);
    router.push('/tests/competitive-exam/take');
  };

  return (
    <div className="min-h-screen">
      <div className="py-12 app-page-header">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-sm uppercase tracking-wider text-[#1e4a7a] mb-2">Tests · Competitive</p>
          <h1 className="text-4xl font-bold mb-4 lux-heading">All India Competitive Selection Paper</h1>
          <p className="text-muted-foreground text-lg">
            Stratified MCQs across Maths, Science, Chemistry, Aptitude, Reasoning, Logical Thinking, English Grammar,
            and Computer Systems — engineered for large cohorts with minimal repetition across students.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <Card className="p-8 lux-surface">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Paper pattern</h2>
          <ul className="space-y-3 text-slate-800 leading-relaxed">
            <li>
              <strong className="text-slate-900 font-semibold">{COMPETITIVE_ALL_INDIA_QUESTIONS} questions</strong> · Multiple choice (four options){' '}
            </li>
            <li>
              <strong className="text-slate-900 font-semibold">{COMPETITIVE_ALL_INDIA_MINUTES} minutes</strong> · Overall countdown timer auto-submits when time ends
            </li>
            <li>
              Questions <strong className="text-slate-900 font-semibold">do not repeat inside your sitting</strong>; each candidate draws a seeded stratified mix so overlapping stems across thousands of attempts stays low (especially for quantitative sections).
            </li>
            <li>
              Sections (counts): Maths (8), Science (7), Chemistry (7), Aptitude (8), Reasoning (8), Logical (8), English (7),
              Computer (7).
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              size="lg"
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/30 px-8"
              onClick={begin}
            >
              Begin examination
            </Button>
            <Button type="button" variant="outline" className="border-border/80" asChild>
              <Link href="/tests">Back to tests hub</Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
