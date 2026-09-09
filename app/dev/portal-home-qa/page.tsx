'use client';

import { PortalShell } from '@/components/student/portal/portal-shell';
import { ARENA_VISUAL_QA_MODEL } from '@/components/dsa/arena/arena-visual-qa-model';
import { derivePortalGamification } from '@/components/student/portal/portal-gamification';
import { PortalHudCard, PortalQuestCard, PortalQuickLinks } from '@/components/student/portal/portal-hud';

/** Dev preview of Command Center layout without auth. */
export default function PortalHomeVisualQaPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Visual QA unavailable in production.
      </div>
    );
  }

  const g = derivePortalGamification({
    rollNumber: ARENA_VISUAL_QA_MODEL.rollNumber,
    completedDays: ARENA_VISUAL_QA_MODEL.daysCompleted,
    completedWeeks: 0,
    stars: 6,
  });

  return (
    <PortalShell
      title="COMMAND CENTER"
      subtitle="Your next move starts here"
      studentName={ARENA_VISUAL_QA_MODEL.studentName}
      gamification={g}
      rightPanel={
        <div className="space-y-3.5">
          <PortalHudCard gamification={g} studentName={ARENA_VISUAL_QA_MODEL.studentName} />
          <PortalQuestCard
            title="Complete 2 array missions"
            progress={0}
            total={2}
            xp={100}
            coins={20}
          />
          <PortalQuickLinks />
        </div>
      }
    >
      <div className="space-y-5">
        <section className="ex-panel relative overflow-hidden rounded-xl p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/85">ELEVATE-X</p>
          <h2 className="mt-2 text-[26px] font-bold text-white sm:text-[30px]">
            Good afternoon, Harsha
          </h2>
          <p className="mt-1.5 max-w-xl text-[14px] text-slate-400">
            Ready to level up today? Pick a path — adventure through DSA or prove yourself in exams.
          </p>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="ex-panel relative overflow-hidden rounded-xl p-5 min-h-[180px]">
            <div
              className="pointer-events-none absolute inset-0 opacity-40 bg-cover bg-center"
              style={{ backgroundImage: "url('/elevatex/arena-map-bg.svg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#07111d] via-[#07111d]/92 to-[#07111d]/55" />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
                Continue your journey
              </p>
              <h3 className="mt-2 text-xl font-bold text-white">Arrays</h3>
              <p className="mt-1 text-[13px] text-slate-400">Week 1: Arrays · 40% complete</p>
              <div className="ex-progress mt-3">
                <span style={{ width: '40%' }} />
              </div>
            </div>
          </div>
          <div className="ex-panel rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Upcoming exams
            </p>
            <p className="mt-3 text-[13px] text-slate-500">No upcoming exams in this preview.</p>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
