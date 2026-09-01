'use client';

import Link from 'next/link';
import { DsaStarRating } from '@/components/dsa/dsa-star-rating';

export type JourneyDay = {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
  stars: number;
  lockReason: string | null;
};

type Props = {
  weekTitle: string;
  topicName: string;
  days: JourneyDay[];
  weekStatus: string;
  weekId: string;
  isLocked: boolean;
};

const FUNNY_LOCK_LINES = [
  'Hold up, hero! Finish the previous level first 🍬',
  'This candy is still in the wrapper…',
  'The road is blocked by gummy bears. Clear Day {n} first!',
];

function lockLine(dayNumber: number): string {
  const template = FUNNY_LOCK_LINES[dayNumber % FUNNY_LOCK_LINES.length];
  return template.replace('{n}', String(dayNumber - 1));
}

function nodeOffset(index: number): string {
  const pattern = ['translate-x-0', '-translate-x-8 sm:-translate-x-14', 'translate-x-0', 'translate-x-8 sm:translate-x-14'];
  return pattern[index % pattern.length];
}

export function DsaJourneyMap({ weekTitle, topicName, days, weekStatus, weekId, isLocked }: Props) {
  const allDaysDone =
    !isLocked && days.length > 0 && days.every((d) => d.status === 'completed');

  return (
    <div className="relative rounded-3xl border-4 border-amber-300/80 bg-gradient-to-b from-sky-300/90 via-emerald-200/80 to-lime-200/90 p-4 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.25)] overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,#fff_0%,transparent_50%),radial-gradient(circle_at_80%_60%,#fde047_0%,transparent_40%)]" />

      <div className="relative text-center mb-6">
        <p className="text-xs font-black uppercase tracking-widest text-purple-900/70">World map</p>
        <h2 className="text-xl sm:text-2xl font-black text-purple-950 drop-shadow-sm">{weekTitle}</h2>
        <p className="text-sm font-bold text-emerald-900/80 mt-1">🎯 {topicName}</p>
      </div>

      {isLocked ? (
        <p className="relative text-center text-sm font-bold text-purple-900 bg-white/50 rounded-2xl py-4 px-3 border-2 border-dashed border-purple-400/50">
          🔒 Complete the previous world to unlock this candy trail!
        </p>
      ) : (
        <ol className="relative flex flex-col items-center gap-3 sm:gap-4 py-2">
          {days.map((day, index) => {
            const isCurrent = day.status === 'available' || day.status === 'in_progress';
            const isCompleted = day.status === 'completed';
            const isDayLocked = day.status === 'locked';
            const href = `/dsa/day/${day.id}${weekStatus === 'completed' ? '?kind=official' : ''}`;

            const node = (
              <div
                className={`relative flex flex-col items-center w-[5.5rem] sm:w-[6.5rem] ${nodeOffset(index)}`}
              >
                {index > 0 ? (
                  <div
                    className={`absolute -top-5 sm:-top-6 left-1/2 -translate-x-1/2 w-1.5 h-5 sm:h-6 rounded-full ${
                      isDayLocked ? 'bg-white/30' : 'dsa-road-path'
                    }`}
                  />
                ) : null}

                <div
                  className={`relative w-[4.5rem] h-[4.5rem] sm:w-[5.25rem] sm:h-[5.25rem] rounded-full flex items-center justify-center border-4 font-black text-lg sm:text-xl shadow-lg transition-transform ${
                    isCompleted
                      ? 'bg-gradient-to-br from-lime-400 to-emerald-500 border-lime-200 text-white'
                      : isCurrent
                        ? 'dsa-node-current bg-gradient-to-br from-amber-300 via-yellow-300 to-orange-400 border-amber-100 text-amber-950'
                        : isDayLocked
                          ? 'bg-slate-400/60 border-slate-300/50 text-slate-600 grayscale'
                          : 'bg-gradient-to-br from-fuchsia-400 to-purple-600 border-pink-200 text-white'
                  }`}
                >
                  {isCompleted ? (
                    <span className="dsa-tick-animate text-3xl sm:text-4xl" aria-hidden>
                      ✓
                    </span>
                  ) : isDayLocked ? (
                    <span className="text-2xl">🔒</span>
                  ) : (
                    <span>{day.dayNumber}</span>
                  )}
                </div>

                <p className="mt-2 text-[11px] sm:text-xs font-black text-purple-950 text-center leading-tight">
                  {day.title}
                </p>

                {isCompleted ? (
                  <div className="mt-1">
                    <DsaStarRating stars={day.stars} animate />
                  </div>
                ) : isCurrent ? (
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded-full animate-pulse">
                    Play now!
                  </span>
                ) : null}
              </div>
            );

            return (
              <li key={day.id} className="w-full flex justify-center">
                {isDayLocked ? (
                  <div title={day.lockReason ?? lockLine(day.dayNumber)} className="cursor-not-allowed">
                    {node}
                    <p className="text-[10px] text-center text-purple-900/70 max-w-[10rem] mt-1 font-medium">
                      {lockLine(day.dayNumber)}
                    </p>
                  </div>
                ) : (
                  <Link href={href} className="hover:scale-105 transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 rounded-full">
                    {node}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {allDaysDone ? (
        <div className="relative mt-6 text-center">
          <Link
            href={`/dsa/week/${weekId}/assessment`}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-rose-500 px-6 py-3 text-sm font-black text-white shadow-[0_8px_24px_rgba(168,85,247,0.5)] hover:scale-105 transition-transform border-2 border-white/40"
          >
            🏆 Boss Battle — Weekly Assignment
          </Link>
          <p className="text-xs font-bold text-purple-900/70 mt-2">All days crushed! Time for the final quest.</p>
        </div>
      ) : null}
    </div>
  );
}
