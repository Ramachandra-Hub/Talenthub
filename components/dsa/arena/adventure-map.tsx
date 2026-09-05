'use client';

import Image from 'next/image';
import { Lock, Check, Crown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArenaZone } from '@/components/dsa/arena/arena-types';

type Props = {
  zones: ArenaZone[];
  currentZoneId: string;
  currentTopicName: string;
  onSelectZone: (zone: ArenaZone) => void;
};

export function AdventureMap({ zones, currentZoneId, currentTopicName, onSelectZone }: Props) {
  const current = zones.find((z) => z.id === currentZoneId) ?? zones[1];

  return (
    <section
      className="relative overflow-x-auto overflow-y-hidden rounded-2xl border border-cyan-500/20 shadow-[0_0_40px_rgba(8,145,178,0.12)]"
      style={{ minHeight: 460 }}
      aria-label="DSA adventure map"
    >
      <div className="relative h-[min(52vh,520px)] min-h-[460px] min-w-[720px] w-full sm:min-w-0">
        <Image
          src="/dsa/arena-map-bg.png"
          alt=""
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 70vw"
          className="object-cover scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#06101c]/35 via-[#06101c]/55 to-[#06101c]/85" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(6,16,28,0.55)_100%)]" />

        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {zones.slice(0, -1).map((zone, i) => {
            const next = zones[i + 1];
            if (!next) return null;
            const active = zone.status === 'completed' || zone.status === 'current';
            return (
              <line
                key={`${zone.id}-${next.id}`}
                x1={`${zone.x}%`}
                y1={`${zone.y}%`}
                x2={`${next.x}%`}
                y2={`${next.y}%`}
                stroke={active ? 'rgba(34,211,238,0.45)' : 'rgba(148,163,184,0.2)'}
                strokeWidth="2"
                strokeDasharray="5 7"
                className={zone.status === 'current' ? 'arena-path-pulse' : undefined}
              />
            );
          })}
        </svg>

        {zones.map((zone) => {
          const isCurrent = zone.id === currentZoneId;
          const isDone = zone.status === 'completed';
          const isBoss = zone.id === 'dsa-master' || zone.status === 'boss';
          const isLocked =
            zone.status === 'locked' || (isBoss && Boolean(zone.lockReason));

          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onSelectZone(zone)}
              className={cn(
                'absolute z-10 -translate-x-1/2 -translate-y-1/2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400',
                isCurrent && 'z-20',
              )}
              style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
              aria-label={`${zone.title} — ${zone.status}`}
            >
              <span
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-transform duration-200 hover:scale-110',
                  isDone &&
                    'border-emerald-400/80 bg-emerald-500/25 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.35)]',
                  isCurrent &&
                    !isBoss &&
                    'border-cyan-300 bg-cyan-400/20 text-cyan-100 arena-zone-glow',
                  isLocked && !isBoss && 'border-slate-600/80 bg-slate-900/70 text-slate-400 grayscale',
                  isBoss &&
                    'border-orange-400/70 bg-orange-500/15 text-orange-200 shadow-[0_0_18px_rgba(251,146,60,0.35)]',
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : null}
                {isCurrent && !isDone && !isBoss ? <Sparkles className="h-4 w-4" /> : null}
                {isLocked && !isBoss ? <Lock className="h-3.5 w-3.5" /> : null}
                {isBoss ? <Crown className="h-4 w-4" /> : null}
              </span>
              <span
                className={cn(
                  'mt-1.5 block whitespace-nowrap text-center text-[9px] font-bold uppercase tracking-[0.14em]',
                  isCurrent ? 'text-cyan-200' : isDone ? 'text-emerald-200/90' : 'text-slate-400',
                )}
              >
                {zone.shortLabel}
              </span>
            </button>
          );
        })}

        {current ? (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2"
            style={{ left: `${current.x}%`, top: `${Math.max(8, current.y - 11)}%` }}
            aria-hidden
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-cyan-200 bg-gradient-to-b from-sky-400 to-indigo-700 text-[10px] font-bold text-white shadow-[0_0_14px_rgba(34,211,238,0.55)]">
              YOU
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-5 left-5 z-20 max-w-[220px] rounded-lg border border-amber-900/50 bg-[linear-gradient(160deg,#5c3d1e_0%,#3b2714_100%)] px-4 py-3 shadow-xl">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-200/80">Current zone</p>
          <p className="mt-1 text-lg font-bold tracking-wide text-amber-50">
            {currentTopicName.toUpperCase()}
          </p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-100/70">
            Learn · Practice · Solve · Level Up!
          </p>
        </div>
      </div>
    </section>
  );
}
