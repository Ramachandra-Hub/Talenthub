'use client';

import Link from 'next/link';
import { AchievementCard } from '@/components/dsa-arena/achievement-card';
import { DsaArenaHeader } from '@/components/dsa-arena/dsa-arena-header';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
import { DsaArenaSubnav } from '@/components/dsa-arena/dsa-arena-subnav';
import { MissionStatus } from '@/components/dsa-arena/mission-status';
import { SkillProgress } from '@/components/dsa-arena/skill-progress';
import {
  DSA_ARENA_ACHIEVEMENTS,
  DSA_ARENA_DEMO_PROFILE,
  DSA_ARENA_TOPICS,
} from '@/lib/dsa-arena/curriculum';

export default function DsaArenaHomePage() {
  return (
    <DsaArenaPageFrame title="DSA Arena" subtitle="Gamified coding journey">
      {({ studentName, progression }) => {
        const continueKey = progression?.continueMissionKey ?? null;
        const continuePair = continueKey
          ? DSA_ARENA_TOPICS.map((t) => {
              const m = t.missions.find((x) => x.id === continueKey);
              return m ? { topic: t, mission: m } : null;
            }).find(Boolean)
          : null;
        const continueLive = continueKey ? progression?.missions[continueKey] : null;

        return (
          <div className="space-y-4 pb-8">
            <DsaArenaSubnav />
            <DsaArenaHeader studentName={studentName} profile={DSA_ARENA_DEMO_PROFILE} />

            <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90">
              <span className="font-bold uppercase tracking-wide">Live progress</span> — mission
              lock / available / in-progress / completed comes from your DSA day state when
              mapped. XP, rank, streak, and achievements below remain{' '}
              <span className="font-semibold">demo</span> only.
            </p>

            <section className="dj-panel rounded-md p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Your journey
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-white">
                    Roadmap & continue learning
                  </h2>
                  <p className="mt-1 text-[12px] text-slate-400">
                    Follow the skill path from Foundations to DSA Master.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/dsa-arena/roadmap" className="dj-btn dj-btn-primary">
                    Open Roadmap
                  </Link>
                </div>
              </div>
            </section>

            {continuePair && continueLive ? (
              <section className="dj-panel rounded-md p-4 sm:p-5 ring-1 ring-cyan-400/25">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
                  Continue{' '}
                  <span className="text-slate-500">· from live DSA day state</span>
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  {continuePair.topic.kingdomTitle}
                </h2>
                <p className="mt-0.5 text-[14px] text-slate-200">{continuePair.mission.title}</p>
                <p className="mt-2 text-[12px] text-slate-400">
                  Difficulty: {continuePair.mission.difficulty}
                </p>
                <SkillProgress className="mt-3" skills={continuePair.mission.skills} />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <MissionStatus status={continueLive.status} />
                  <span className="text-[12px] font-semibold text-cyan-200">
                    +{continuePair.mission.xp} XP{' '}
                    <span className="text-[9px] uppercase text-amber-400/80">preview</span>
                  </span>
                </div>
                <Link
                  href={`/dsa-arena/mission/${continuePair.topic.id}/${continuePair.mission.id}`}
                  className="dj-btn dj-btn-primary mt-4"
                >
                  {continueLive.status === 'in_progress' ? 'Continue Mission' : 'Open Mission'}
                </Link>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Missions completed', value: DSA_ARENA_DEMO_PROFILE.missionsCompleted },
                { label: 'Problems solved', value: DSA_ARENA_DEMO_PROFILE.problemsSolved },
                { label: 'Current streak', value: DSA_ARENA_DEMO_PROFILE.streak },
                {
                  label: 'Arena rank',
                  value: DSA_ARENA_DEMO_PROFILE.arenaRank
                    ? `#${DSA_ARENA_DEMO_PROFILE.arenaRank}`
                    : '—',
                },
              ].map((stat) => (
                <div key={stat.label} className="dj-panel rounded-md px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-white">{stat.value}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase text-amber-400/80">demo</p>
                </div>
              ))}
            </section>

            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Recent achievements <span className="text-amber-400/80">· demo</span>
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {DSA_ARENA_ACHIEVEMENTS.filter((a) => a.earned).map((a) => (
                  <AchievementCard key={a.id} achievement={a} />
                ))}
              </div>
            </section>
          </div>
        );
      }}
    </DsaArenaPageFrame>
  );
}
