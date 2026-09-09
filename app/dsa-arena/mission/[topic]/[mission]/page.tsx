'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DsaArenaPageFrame } from '@/components/dsa-arena/dsa-arena-page-frame';
import { MissionBreadcrumb } from '@/components/dsa-arena/mission-breadcrumb';
import { MissionStatus } from '@/components/dsa-arena/mission-status';
import { SkillProgress } from '@/components/dsa-arena/skill-progress';
import { getMissionByIds } from '@/lib/dsa-arena/curriculum';
import type { ArenaMissionProgress, ArenaProgressionSnapshot } from '@/lib/dsa/arena-progression';
import type { MissionCodeLabTarget } from '@/lib/dsa/journey-missions';

function MissionBody({
  topicId,
  missionId,
  progression,
}: {
  topicId: string;
  missionId: string;
  progression: ArenaProgressionSnapshot | null;
}) {
  const router = useRouter();
  const pair = getMissionByIds(topicId, missionId);
  const live: ArenaMissionProgress | null = progression?.missions[missionId] ?? null;
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<MissionCodeLabTarget | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!pair) {
      setResolving(false);
      return;
    }
    const missionKey = pair.mission.id;
    let cancelled = false;
    const run = async () => {
      setResolving(true);
      setResolveError(null);
      try {
        const res = await fetch(
          `/api/student/dsa/journey/missions/${encodeURIComponent(missionKey)}`,
          { credentials: 'include', cache: 'no-store' },
        );
        const json = (await res.json()) as MissionCodeLabTarget & { error?: string };
        if (!res.ok) {
          if (!cancelled) {
            setTarget(null);
            setResolveError(json.error ?? 'Could not resolve mission mapping.');
          }
          return;
        }
        if (!cancelled) setTarget(json);
      } catch {
        if (!cancelled) {
          setTarget(null);
          setResolveError('Network error resolving mission mapping.');
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [topicId, missionId]);

  if (!pair) {
    return (
      <div className="dj-panel rounded-md p-6 text-center">
        <p className="text-slate-300">Mission not found.</p>
        <Link href="/dsa-arena/roadmap" className="dj-btn dj-btn-primary mt-4">
          Back to Roadmap
        </Link>
      </div>
    );
  }

  const { topic, mission } = pair;
  const status = live?.status ?? 'unmapped';
  const curriculumLocked = false; // never trust curriculum.status for access
  const canStart = Boolean(
    !curriculumLocked &&
      target?.accessible &&
      target.mappingSource === 'authoritative' &&
      target.href &&
      (status === 'available' || status === 'in_progress' || status === 'completed'),
  );
  const showUnconnected =
    !resolving &&
    !canStart &&
    (status === 'unmapped' ||
      status === 'locked' ||
      target?.mappingSource === 'none' ||
      (target && !target.accessible) ||
      Boolean(resolveError));

  const enterCodeLab = () => {
    if (!canStart || busy || !target?.href) return;
    setBusy(true);
    router.push(target.href);
  };

  const codingLabel =
    live?.totalCoding != null && live.completedCoding != null
      ? `${live.completedCoding}/${live.totalCoding} coding`
      : null;
  const mcqLabel =
    live?.totalMcq != null && live.attemptedMcq != null
      ? `${live.attemptedMcq}/${live.totalMcq} MCQ`
      : null;

  return (
    <div className="space-y-4 pb-10">
      <MissionBreadcrumb
        items={[
          { label: 'DSA Arena', href: '/dsa-arena' },
          { label: 'Roadmap', href: '/dsa-arena/roadmap' },
          { label: topic.title, href: `/dsa-arena/topic/${topic.id}` },
          { label: `Mission ${String(mission.number).padStart(2, '0')}` },
        ]}
      />

      <article className="dj-panel rounded-md p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {topic.kingdomTitle}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
              {String(mission.number).padStart(2, '0')} · {mission.title}
            </h1>
          </div>
          <MissionStatus status={status} />
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{mission.description}</p>

        <div className="mt-4 grid gap-2 text-[12px] text-slate-400 sm:grid-cols-3">
          <p>
            <span className="text-slate-500">Topic</span>
            <br />
            {topic.title}
          </p>
          <p>
            <span className="text-slate-500">Difficulty</span>
            <br />
            {mission.difficulty}
          </p>
          <p>
            <span className="text-slate-500">Reward</span>
            <br />
            +{mission.xp} XP{' '}
            <span className="text-[9px] uppercase tracking-wide text-amber-400/80">preview</span>
          </p>
        </div>

        <SkillProgress className="mt-4" skills={mission.skills} />

        {(codingLabel || mcqLabel) && live?.mapped ? (
          <p className="mt-3 text-[12px] tabular-nums text-slate-300">
            Live day activity: {[codingLabel, mcqLabel].filter(Boolean).join(' · ')}
          </p>
        ) : null}

        <p className="mt-4 text-[12px] text-slate-500">
          Mission status above is derived from your DSA day state when mapped. XP labels remain
          preview only.
        </p>

        {resolving ? (
          <p className="mt-4 text-[12px] text-slate-400">Checking Code Lab connection…</p>
        ) : null}

        {showUnconnected ? (
          <div
            className="mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-3"
            role="status"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200/90">
              {status === 'locked' ? 'Mission locked' : 'Mission not yet connected'}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-200">
              {live?.reason ||
                target?.reason ||
                resolveError ||
                'This mission is part of the ELEVATE-X journey, but its coding workspace is not available yet.'}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/dsa-arena/topic/${topic.id}`} className="dj-btn dj-btn-ghost">
            ← Back to Topic
          </Link>
          <Link href="/dsa-arena/roadmap" className="dj-btn dj-btn-ghost">
            Back to Roadmap
          </Link>
          {canStart ? (
            <button
              type="button"
              className="dj-btn dj-btn-primary"
              disabled={busy}
              onClick={enterCodeLab}
            >
              {busy
                ? 'Opening Code Lab…'
                : status === 'completed'
                  ? 'Open Code Lab'
                  : status === 'in_progress'
                    ? 'Continue in Code Lab'
                    : 'Start Mission'}
            </button>
          ) : (
            <button type="button" className="dj-btn dj-btn-ghost" disabled>
              {status === 'locked'
                ? 'Locked'
                : status === 'unmapped'
                  ? 'Not Connected'
                  : resolving
                    ? 'Checking…'
                    : 'Code Lab unavailable'}
            </button>
          )}
        </div>

        {canStart ? (
          <p className="mt-3 text-[10px] text-slate-600">
            Opens the existing Code Lab at {target?.href} — coding UI unchanged.
          </p>
        ) : null}
      </article>
    </div>
  );
}

export default function DsaArenaMissionPage() {
  const params = useParams();
  const topicId = String(params.topic ?? '');
  const missionId = String(params.mission ?? '');

  return (
    <DsaArenaPageFrame title="Mission" subtitle="Enter Code Lab">
      {({ progression }) => (
        <MissionBody topicId={topicId} missionId={missionId} progression={progression} />
      )}
    </DsaArenaPageFrame>
  );
}
