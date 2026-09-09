'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BossCard } from '@/components/dsa-arena/boss-card';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
import { MissionBreadcrumb } from '@/components/dsa-arena/mission-breadcrumb';
import { MissionCard } from '@/components/dsa-arena/mission-card';
import { MissionStatus } from '@/components/dsa-arena/mission-status';
import { SkillProgress } from '@/components/dsa-arena/skill-progress';
import { getTopicById } from '@/lib/dsa-arena/curriculum';

export default function DsaArenaTopicPage() {
  const params = useParams();
  const topicId = String(params.topic ?? '');
  const topic = getTopicById(topicId);

  return (
    <DsaArenaPageFrame title={topic?.title ?? 'Topic'} subtitle="Topic missions">
      {({ progression }) => {
        if (!topic) {
          return (
            <div className="dj-panel rounded-md p-6 text-center">
              <p className="text-slate-300">Topic not found.</p>
              <Link href="/dsa-arena/roadmap" className="dj-btn dj-btn-primary mt-4">
                Back to Roadmap
              </Link>
            </div>
          );
        }

        const liveTopic = progression?.topics[topic.id] ?? null;

        return (
          <div className="space-y-4 pb-10">
            <MissionBreadcrumb
              items={[
                { label: 'DSA Arena', href: '/dsa-arena' },
                { label: 'Roadmap', href: '/dsa-arena/roadmap' },
                { label: topic.title },
              ]}
            />

            <section className="dj-panel rounded-md p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400/85">
                    Topic
                  </p>
                  <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                    {topic.kingdomTitle}
                  </h1>
                </div>
                {liveTopic ? <MissionStatus status={liveTopic.status} /> : null}
              </div>
              <p className="mt-2 text-[13px] text-slate-400">{topic.description}</p>
              {liveTopic && liveTopic.mappedMissionCount > 0 ? (
                <p className="mt-4 text-[13px] tabular-nums text-slate-300">
                  Mapped progress: {liveTopic.completedMappedCount}/{liveTopic.mappedMissionCount}{' '}
                  missions ({liveTopic.mappedCompletionPercent}%)
                </p>
              ) : (
                <p className="mt-4 text-[12px] text-amber-200/90">
                  No authoritative mission mappings for this topic yet — cards may show Not
                  Connected.
                </p>
              )}
              <SkillProgress className="mt-3" skills={topic.skills} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/dsa-arena/roadmap" className="dj-btn dj-btn-ghost">
                  ← Back to Roadmap
                </Link>
                <Link href="/dsa-arena" className="dj-btn dj-btn-ghost">
                  DSA Arena
                </Link>
              </div>
            </section>

            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Missions
              </h2>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {topic.missions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    topicId={topic.id}
                    mission={mission}
                    live={progression?.missions[mission.id] ?? null}
                  />
                ))}
              </div>
            </section>

            {topic.boss ? (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Boss challenge <span className="text-amber-400/80">· preview</span>
                </h2>
                <div className="mt-2">
                  <BossCard boss={topic.boss} />
                </div>
              </section>
            ) : null}
          </div>
        );
      }}
    </DsaArenaPageFrame>
  );
}
