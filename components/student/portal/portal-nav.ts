import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Swords,
  ClipboardList,
  BookOpen,
  Trophy,
  Medal,
  Award,
  User,
} from 'lucide-react';

export type PortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match function for active state */
  isActive: (pathname: string) => boolean;
};

export const PORTAL_NAV: PortalNavItem[] = [
  {
    href: '/home',
    label: 'Home',
    icon: Home,
    isActive: (p) => p === '/home',
  },
  {
    href: '/dsa-arena',
    label: 'DSA Arena',
    icon: Swords,
    isActive: (p) =>
      p === '/dsa-arena' ||
      p.startsWith('/dsa-arena/') ||
      p === '/dsa' ||
      (p.startsWith('/dsa/') && !p.startsWith('/dsa/history')),
  },
  {
    href: '/exams',
    label: 'Exam Center',
    icon: ClipboardList,
    isActive: (p) => p.startsWith('/exams') || p.startsWith('/placement/assessment'),
  },
  {
    href: '/learning',
    label: 'Learning Hub',
    icon: BookOpen,
    isActive: (p) => p.startsWith('/learning'),
  },
  {
    href: '/dsa-arena/contest',
    label: 'Contests',
    icon: Trophy,
    isActive: (p) =>
      p.startsWith('/contests') ||
      p === '/dsa-arena/contest' ||
      p.startsWith('/dsa-arena/contest/') ||
      p.startsWith('/dsa-arena/contests'),
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    icon: Medal,
    isActive: (p) => p.startsWith('/leaderboard'),
  },
  {
    href: '/achievements',
    label: 'Achievements',
    icon: Award,
    isActive: (p) => p.startsWith('/achievements') || p.startsWith('/dsa/history'),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: User,
    isActive: (p) => p.startsWith('/profile'),
  },
];

export type PortalMode =
  | 'command'
  | 'adventure'
  | 'assessment'
  | 'learning'
  | 'compete'
  | 'champions'
  | 'profile';

export type PortalGamification = {
  level: number;
  xp: number;
  xpToNext: number;
  streak: number;
  coins: number;
  badges: number;
};

export type PortalStudent = {
  name: string;
  rollNumber: string;
  branch: string | null;
  year: string | null;
};
