'use client';

import Link from 'next/link';
import { PortalShell } from '@/components/student/portal/portal-shell';
import { PortalHudCard } from '@/components/student/portal/portal-hud';
import { derivePortalGamification } from '@/components/student/portal/portal-gamification';
import type { PortalGamification } from '@/components/student/portal/portal-nav';

type Props = {
  title: string;
  subtitle: string;
  studentName?: string;
  children: React.ReactNode;
  gamification?: PortalGamification;
};

/** Lightweight shell for portal subpages that don't need live API boot. */
export function PortalPageFrame({
  title,
  subtitle,
  studentName = 'Student',
  children,
  gamification,
}: Props) {
  const g =
    gamification ??
    derivePortalGamification({ rollNumber: studentName, completedDays: 2, completedWeeks: 0 });

  return (
    <PortalShell
      title={title}
      subtitle={subtitle}
      studentName={studentName}
      gamification={g}
      rightPanel={
        <div className="space-y-3.5">
          <PortalHudCard gamification={g} studentName={studentName} />
          <div className="ex-panel rounded-lg p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Explore</p>
            <div className="mt-2 space-y-1.5 text-[12px]">
              <Link href="/home" className="block text-slate-300 hover:text-cyan-300">
                Command Center
              </Link>
              <Link href="/contests" className="block text-slate-300 hover:text-cyan-300">
                Contests
              </Link>
              <Link href="/dsa-arena" className="block text-slate-300 hover:text-cyan-300">
                DSA Arena
              </Link>
              <Link href="/exams" className="block text-slate-300 hover:text-cyan-300">
                Exam Center
              </Link>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </PortalShell>
  );
}
