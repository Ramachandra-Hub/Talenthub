import { Suspense } from 'react';
import { DsaDayView } from '@/components/dsa/dsa-day-view';

type Ctx = { params: Promise<{ dayId: string }> };

export default async function DsaDayPage({ params }: Ctx) {
  const { dayId } = await params;
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-600">Loading day…</p>}>
      <DsaDayView dayId={dayId} />
    </Suspense>
  );
}
