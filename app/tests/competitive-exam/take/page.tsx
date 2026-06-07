'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { COMPETITIVE_ALL_INDIA_MINUTES, COMPETITIVE_ALL_INDIA_QUESTIONS } from '@/lib/constants';
import { buildCompetitiveExamPaper } from '@/lib/competitive-exam/build-paper';
import {
  COMPETITIVE_SESSION_SEED_KEY,
  getCompetitiveAllIndiaTestMeta,
} from '@/lib/competitive-exam/exam-definition';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getClientUser } from '@/lib/client-auth';
import { sanitizeQuestionsForStudent } from '@/lib/questions/sanitize-for-student';
import { TestProvider } from '@/app/tests/take/[testId]/test-context';
import TestInterface from '@/app/tests/take/[testId]/test-interface';

export default function CompetitiveExamTakePage() {
  const router = useRouter();
  const [seed, setSeed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const user = await getClientUser();
      if (!user?.id) {
        router.replace('/auth/login/student?redirect=/tests/competitive-exam/take');
        return;
      }

      try {
        const res = await fetchWithAuth('/api/student/competitive-exam/session');
        if (res.ok) {
          const json = (await res.json()) as { seed?: string };
          const serverSeed = json.seed?.trim();
          if (serverSeed) {
            sessionStorage.setItem(COMPETITIVE_SESSION_SEED_KEY, serverSeed);
            if (!cancelled) setSeed(serverSeed);
            return;
          }
        }
      } catch {
        // fall through to local cache
      }

      const local = sessionStorage.getItem(COMPETITIVE_SESSION_SEED_KEY);
      if (!local) {
        router.replace('/tests/competitive-exam');
        return;
      }
      if (!cancelled) setSeed(local);
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const questions = useMemo(() => {
    if (!seed) return [];
    return sanitizeQuestionsForStudent(buildCompetitiveExamPaper(seed));
  }, [seed]);

  const test = useMemo(() => getCompetitiveAllIndiaTestMeta(), []);

  const paperOk = questions.length === COMPETITIVE_ALL_INDIA_QUESTIONS;

  if (!seed || !paperOk) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-muted-foreground text-center">
          {!seed ? 'Redirecting to instructions…' : 'Building your personalised paper…'}
        </p>
        {!paperOk && seed ? (
          <Button variant="outline" asChild>
            <Link href="/tests/competitive-exam">Start again</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 exam-mode bg-gray-50">
        <Card className="max-w-lg w-full border-gray-300 p-8 shadow-2xl bg-white text-gray-950">
          <h1 className="text-2xl font-bold mb-2 text-gray-950">{test.name}</h1>
          <p className="text-sm text-gray-700 mb-6">{test.description}</p>
          <div className="space-y-3 rounded-lg border-2 border-[#1e3a5f] bg-blue-50 p-4 mb-6 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700 font-medium">Questions</span>
              <span className="font-bold text-[#0c2340] text-lg">{COMPETITIVE_ALL_INDIA_QUESTIONS}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 font-medium">Duration</span>
              <span className="font-bold text-[#0c2340] text-lg">{COMPETITIVE_ALL_INDIA_MINUTES} minutes</span>
            </div>
          </div>
          <Button className="w-full mb-2 bg-[#1e3a5f] hover:bg-[#1e3a5f] text-white font-semibold" type="button" onClick={() => setReady(true)}>
            Start timer & begin
          </Button>
          <Button variant="outline" className="w-full" type="button" asChild>
            <Link href="/tests/competitive-exam">Cancel</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <TestProvider>
      <TestInterface test={test} questions={questions} fullAccess />
    </TestProvider>
  );
}
