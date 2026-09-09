'use client';

import { RoadmapNode } from '@/components/dsa-arena/roadmap-node';
import { DSA_ARENA_TOPICS } from '@/lib/dsa-arena/curriculum';
import type { ArenaProgressionSnapshot } from '@/lib/dsa/arena-progression';

type Props = {
  progression?: ArenaProgressionSnapshot | null;
};

export function DsaRoadmap({ progression }: Props) {
  return (
    <div className="dj-roadmap" aria-label="DSA journey roadmap">
      {DSA_ARENA_TOPICS.map((topic, i) => (
        <RoadmapNode
          key={topic.id}
          topic={topic}
          live={progression?.topics[topic.id] ?? null}
          showConnector={i < DSA_ARENA_TOPICS.length - 1}
        />
      ))}
    </div>
  );
}
