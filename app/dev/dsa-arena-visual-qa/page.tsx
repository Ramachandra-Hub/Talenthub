'use client';

import Link from 'next/link';
import { AchievementCard } from '@/components/dsa-arena/achievement-card';
import { BossCard } from '@/components/dsa-arena/boss-card';
import { DsaArenaHeader } from '@/components/dsa-arena/dsa-arena-header';
import { DsaRoadmap } from '@/components/dsa-arena/dsa-roadmap';
import { MissionCard } from '@/components/dsa-arena/mission-card';
import { MissionStatus } from '@/components/dsa-arena/mission-status';
import { SkillProgress } from '@/components/dsa-arena/skill-progress';
import {
  DSA_ARENA_ACHIEVEMENTS,
  DSA_ARENA_DEMO_PROFILE,
  getCurrentMission,
  getTopicById,
} from '@/lib/dsa-arena/curriculum';

/** Local visual QA — no auth. Disabled in production builds. */
export default function DsaArenaJourneyVisualQaPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Visual QA unavailable in production.
      </div>
    );
  }

  const current = getCurrentMission();
  const sorting = getTopicById('sorting')!;

  return (
    <div className="ex-portal dsa-journey min-h-screen">
      <div className="ex-portal-mist" aria-hidden />
      <div className="relative z-[1] mx-auto max-w-[1100px] space-y-10 px-3 py-6 sm:px-5">
        <p className="text-[10px] text-amber-200/80">
          DEV ONLY — DSA Arena journey visual QA (fixture curriculum)
        </p>

        <section id="qa-home" className="space-y-4">
          <h2 className="text-sm font-semibold text-cyan-200">1 · Arena home</h2>
          <DsaArenaHeader studentName="Asha" profile={DSA_ARENA_DEMO_PROFILE} />
          {current ? (
            <div className="dj-panel rounded-md p-4 ring-1 ring-cyan-400/25">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400/85">
                Current mission
              </p>
              <p className="mt-1 text-lg font-semibold text-white">{current.topic.kingdomTitle}</p>
              <p className="text-slate-300">{current.mission.title}</p>
              <SkillProgress className="mt-2" skills={current.mission.skills} />
              <MissionStatus className="mt-2" status="in_progress" />
              <Link
                href={`/dsa-arena/mission/${current.topic.id}/${current.mission.id}`}
                className="dj-btn dj-btn-primary mt-3"
              >
                Continue Mission
              </Link>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {DSA_ARENA_ACHIEVEMENTS.filter((a) => a.earned).map((a) => (
              <AchievementCard key={a.id} achievement={a} />
            ))}
          </div>
        </section>

        <section id="qa-roadmap" className="space-y-3">
          <h2 className="text-sm font-semibold text-cyan-200">2 · Roadmap</h2>
          <DsaRoadmap />
        </section>

        <section id="qa-topic" className="space-y-3">
          <h2 className="text-sm font-semibold text-cyan-200">3 · Topic — Sorting</h2>
          <div className="dj-panel rounded-md p-4">
            <h3 className="text-xl font-semibold text-white">{sorting.kingdomTitle}</h3>
            <p className="mt-1 text-[13px] text-slate-400">{sorting.description}</p>
            <SkillProgress className="mt-3" skills={sorting.skills} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sorting.missions.map((m, i) => {
              const fixtureStatus =
                m.id === 'unmapped-preview'
                  ? 'unmapped'
                  : i === 0
                    ? 'completed'
                    : i === 1
                      ? 'completed'
                      : i === 2
                        ? 'in_progress'
                        : i === 3
                          ? 'available'
                          : 'locked';
              return (
                <MissionCard
                  key={m.id}
                  topicId={sorting.id}
                  mission={m}
                  live={{
                    missionKey: m.id,
                    topicKey: sorting.id,
                    mapped: fixtureStatus !== 'unmapped',
                    dayId: fixtureStatus === 'unmapped' ? null : 'fixture-day',
                    href: fixtureStatus === 'unmapped' ? null : '/dsa/day/fixture-day',
                    access:
                      fixtureStatus === 'unmapped'
                        ? 'unmapped'
                        : fixtureStatus === 'locked'
                          ? 'locked'
                          : 'accessible',
                    progress:
                      fixtureStatus === 'completed'
                        ? 'completed'
                        : fixtureStatus === 'in_progress'
                          ? 'in_progress'
                          : fixtureStatus === 'available'
                            ? 'not_started'
                            : null,
                    status: fixtureStatus as
                      | 'completed'
                      | 'in_progress'
                      | 'available'
                      | 'locked'
                      | 'unmapped',
                    reason: null,
                    completedCoding: fixtureStatus === 'unmapped' ? null : 1,
                    totalCoding: fixtureStatus === 'unmapped' ? null : 3,
                    attemptedMcq: fixtureStatus === 'unmapped' ? null : 2,
                    totalMcq: fixtureStatus === 'unmapped' ? null : 5,
                  }}
                />
              );
            })}
          </div>
          {sorting.boss ? <BossCard boss={sorting.boss} /> : null}
        </section>

        <p className="text-[11px] text-slate-500">
          Live routes: /dsa-arena · GET /api/student/dsa/journey/progression ·
          /dsa-arena/mission/sorting/insertion-sort · unmapped-preview fail-closed
        </p>
      </div>
    </div>
  );
}
