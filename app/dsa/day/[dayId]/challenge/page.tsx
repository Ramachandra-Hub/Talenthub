import { Suspense } from 'react';
import { ChallengeChamberPage } from '@/components/student/portal/challenge/challenge-chamber-page';

type Ctx = { params: Promise<{ dayId: string }> };

export const metadata = {
  title: 'Challenge Chamber — ELEVATE-X',
};

export default async function DsaDayChallengeRoute({ params }: Ctx) {
  const { dayId } = await params;
  return (
    <Suspense
      fallback={
        <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
          Loading challenge…
        </div>
      }
    >
      <ChallengeChamberPage dayId={dayId} />
    </Suspense>
  );
}
