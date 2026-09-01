'use client';

import { useEffect, useState } from 'react';
import { DsaStarRating } from '@/components/dsa/dsa-star-rating';

type Props = {
  open: boolean;
  dayNumber: number;
  stars: number;
  message: string;
  onClose: () => void;
};

export function DsaVictoryOverlay({ open, dayNumber, stars, message, onClose }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setShow(true);
      const t = window.setTimeout(onClose, 4200);
      return () => clearTimeout(t);
    }
    setShow(false);
  }, [open, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/70 backdrop-blur-sm">
      <div className="relative max-w-sm w-full rounded-3xl border-4 border-amber-300 bg-gradient-to-b from-violet-500 via-fuchsia-500 to-rose-500 p-8 text-center shadow-2xl">
        {['🍬', '⭐', '🎉', '✨'].map((emoji, i) => (
          <span
            key={i}
            className="absolute text-2xl pointer-events-none"
            style={{
              left: `${15 + i * 22}%`,
              top: '8%',
              animation: `dsa-confetti 1.2s ease-out ${i * 0.15}s forwards`,
            }}
          >
            {emoji}
          </span>
        ))}
        <div className="dsa-tick-animate mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 border-4 border-white flex items-center justify-center text-5xl text-white shadow-lg mb-4">
          ✓
        </div>
        <h2 className="text-2xl font-black text-white drop-shadow-md">Day {dayNumber} Crushed!</h2>
        <p className="text-sm font-bold text-white/90 mt-2">{message}</p>
        <div className="mt-4 flex justify-center">
          <DsaStarRating stars={stars} size="lg" animate />
        </div>
        <p className="text-xs text-white/75 mt-4 font-semibold">Next level unlocking…</p>
      </div>
    </div>
  );
}
