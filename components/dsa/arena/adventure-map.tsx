'use client';

import { Lock, Check, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArenaZone } from '@/components/dsa/arena/arena-types';

type Props = {
  zones: ArenaZone[];
  currentZoneId: string;
  currentTopicName: string;
  onSelectZone: (zone: ArenaZone) => void;
};

function pathD(zones: ArenaZone[]): string {
  if (zones.length < 2) return '';
  const first = zones[0];
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < zones.length; i += 1) {
    const prev = zones[i - 1];
    const cur = zones[i];
    const c1x = prev.x + (cur.x - prev.x) * 0.45;
    const c1y = prev.y - Math.abs(cur.x - prev.x) * 0.12;
    const c2x = prev.x + (cur.x - prev.x) * 0.55;
    const c2y = cur.y + Math.abs(cur.x - prev.x) * 0.1;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${cur.x} ${cur.y}`;
  }
  return d;
}

export function AdventureMap({ zones, currentZoneId, currentTopicName, onSelectZone }: Props) {
  const current = zones.find((z) => z.id === currentZoneId) ?? zones[1];
  const d = pathD(zones);

  return (
    <section
      className="relative overflow-x-auto overflow-y-hidden rounded-xl border border-cyan-400/15 shadow-[0_0_0_1px_rgba(8,145,178,0.08),0_24px_60px_rgba(0,0,0,0.45)]"
      aria-label="DSA adventure map"
    >
      <div className="relative h-[min(56vh,520px)] min-h-[480px] min-w-[760px] w-full sm:min-w-0">
        <div
          className="absolute inset-0 scale-[1.02] bg-cover bg-[center_38%]"
          style={{ backgroundImage: "url('/elevatex/arena-map-bg.svg')" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#040a12]/12 via-transparent to-[#040a12]/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(4,10,18,0.32)_100%)]" />

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d={d}
            fill="none"
            stroke="rgba(15, 23, 42, 0.55)"
            strokeWidth="2.2"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={d}
            fill="none"
            stroke="rgba(34, 211, 238, 0.55)"
            strokeWidth="1.4"
            strokeDasharray="1.2 1.8"
            vectorEffect="non-scaling-stroke"
            className="arena-path-pulse"
          />
          <path
            d={d}
            fill="none"
            stroke="rgba(148, 163, 184, 0.18)"
            strokeWidth="1.2"
            strokeDasharray="1.2 1.8"
            vectorEffect="non-scaling-stroke"
            style={{ strokeDashoffset: 1.5 }}
          />
        </svg>

        {zones.map((zone) => {
          const isCurrent = zone.id === currentZoneId;
          const isDone = zone.status === 'completed';
          const isBoss = zone.id === 'dsa-master' || zone.status === 'boss';
          const isLocked = zone.status === 'locked' || (isBoss && Boolean(zone.lockReason));

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
                  'relative flex h-12 w-12 items-center justify-center rounded-[10px] border transition-transform duration-200 hover:scale-110',
                  isDone &&
                    'border-emerald-300/70 bg-emerald-500/20 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.4)] rotate-45',
                  isCurrent &&
                    !isBoss &&
                    'border-cyan-200/90 bg-cyan-400/25 text-cyan-50 arena-zone-glow rotate-45',
                  isLocked &&
                    !isBoss &&
                    'border-slate-500/50 bg-slate-950/75 text-slate-500 rotate-45 grayscale brightness-75',
                  isBoss &&
                    'rounded-lg rotate-0 border-orange-400/80 bg-gradient-to-b from-orange-500/25 to-red-900/40 text-orange-100 shadow-[0_0_22px_rgba(251,146,60,0.45)] h-14 w-14',
                )}
              >
                <span className={cn('flex items-center justify-center', !isBoss && '-rotate-45')}>
                  {isDone ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
                  {isCurrent && !isDone && !isBoss ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_10px_#67e8f9]" />
                  ) : null}
                  {isLocked && !isBoss ? <Lock className="h-3.5 w-3.5" /> : null}
                  {isBoss ? <Crown className="h-5 w-5" /> : null}
                </span>
              </span>
              <span
                className={cn(
                  'mt-2 block whitespace-nowrap rounded-md px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm',
                  isCurrent
                    ? 'bg-cyan-950/70 text-cyan-100'
                    : isDone
                      ? 'bg-emerald-950/60 text-emerald-100/90'
                      : isBoss
                        ? 'bg-orange-950/70 text-orange-100'
                        : 'bg-slate-950/60 text-slate-400',
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
            style={{ left: `${current.x}%`, top: `${Math.max(5, current.y - 15)}%` }}
            aria-hidden
          >
            <div className="relative flex flex-col items-center drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
              {/* Compact adventurer silhouette */}
              <svg width="28" height="36" viewBox="0 0 28 36" fill="none" aria-hidden>
                <ellipse cx="14" cy="34" rx="7" ry="2" fill="rgba(34,211,238,0.25)" />
                <path
                  d="M14 4c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5 2.2-5 5-5Z"
                  fill="url(#advHead)"
                />
                <path
                  d="M8 16.5c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5V22c0 1.2-.6 2.3-1.6 2.9L17 26.5V32h-2.2v-4.2h-1.6V32H11v-5.5l-1.4-1.6A3.4 3.4 0 0 1 8 22v-5.5Z"
                  fill="url(#advBody)"
                />
                <defs>
                  <linearGradient id="advHead" x1="9" y1="4" x2="19" y2="14" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#7dd3fc" />
                    <stop offset="1" stopColor="#2563eb" />
                  </linearGradient>
                  <linearGradient id="advBody" x1="8" y1="15" x2="20" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#38bdf8" />
                    <stop offset="1" stopColor="#1e3a8a" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-4 left-4 z-20 max-w-[230px] overflow-hidden rounded-md border border-[#8b5a2b]/70 shadow-[0_10px_28px_rgba(0,0,0,0.5)]">
          <div className="bg-[linear-gradient(180deg,#6b4423_0%,#4a2f16_45%,#3a2412_100%)] px-4 py-3">
            <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(0,0,0,0.25)_2px,rgba(0,0,0,0.25)_3px)]" />
            <p className="relative text-[9px] font-bold uppercase tracking-[0.24em] text-amber-200/75">
              Current zone
            </p>
            <p className="relative mt-1 text-xl font-bold tracking-wide text-amber-50 drop-shadow">
              {currentTopicName.toUpperCase()}
            </p>
            <p className="relative mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/65">
              Learn · Practice · Solve · Level Up!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
