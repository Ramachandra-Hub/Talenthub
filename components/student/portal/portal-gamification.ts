import type { PortalGamification } from '@/components/student/portal/portal-nav';

export function derivePortalGamification(seed: {
  rollNumber?: string;
  completedDays?: number;
  completedWeeks?: number;
  stars?: number;
}): PortalGamification {
  const days = seed.completedDays ?? 0;
  const weeks = seed.completedWeeks ?? 0;
  const stars = seed.stars ?? 0;
  const xpTotal = days * 120 + weeks * 250 + stars * 40;
  const level = Math.max(1, Math.floor(xpTotal / 800) + 1);
  let hash = 0;
  const roll = seed.rollNumber || 'student';
  for (let i = 0; i < roll.length; i += 1) hash = (hash * 31 + roll.charCodeAt(i)) | 0;
  hash = Math.abs(hash);

  return {
    level,
    xp: xpTotal % 800,
    xpToNext: 800,
    streak: Math.min(30, days + (hash % 4)),
    coins: 80 + days * 35 + stars * 10,
    badges: Math.min(24, 2 + days + weeks * 2),
  };
}

export function greetingForNow(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
