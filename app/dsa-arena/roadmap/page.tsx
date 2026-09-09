'use client';

import Link from 'next/link';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
import { DsaRoadmap } from '@/components/dsa-arena/dsa-roadmap';
import { MissionBreadcrumb } from '@/components/dsa-arena/mission-breadcrumb';

export default function DsaArenaRoadmapPage() {
  return (
    <DsaArenaPageFrame title="DSA Roadmap" subtitle="Your skill journey">
      {({ progression }) => (
        <div className="space-y-4 pb-10">
          <MissionBreadcrumb
            items={[
              { label: 'DSA Arena', href: '/dsa-arena' },
              { label: 'Roadmap' },
            ]}
          />
          <div className="dj-panel rounded-md px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-white">Your DSA Journey</h1>
              <span className="rounded-sm border border-cyan-400/35 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-100">
                Live mapped state
              </span>
            </div>
            <p className="mt-1 text-[13px] text-slate-400">
              Mapped topics use your real DSA day progress. Topics without a journey mapping show
              as Not Connected. Completed ✓ · In progress ● · Available ○ · Locked 🔒 · Not
              connected ⊖
            </p>
            <Link href="/dsa-arena" className="dj-btn dj-btn-ghost mt-3">
              ← Back to Arena
            </Link>
          </div>
          <DsaRoadmap progression={progression} />
        </div>
      )}
    </DsaArenaPageFrame>
  );
}
