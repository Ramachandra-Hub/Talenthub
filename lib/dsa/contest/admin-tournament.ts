import { prisma } from '@/lib/prisma';
import { ensureDsaTables, ensureDsaSchemaExtensions } from '@/lib/dsa/ensure-tables';
import { ensureDsaContestTables } from '@/lib/dsa/contest/ensure-tables';

async function ready() {
  await ensureDsaTables();
  await ensureDsaSchemaExtensions();
  await ensureDsaContestTables();
}

export type ContestFighterTier =
  | 'conqueror'
  | 'ace'
  | 'crown'
  | 'diamond'
  | 'platinum'
  | 'gold'
  | 'silver'
  | 'bronze';

const TIER_META: Record<
  ContestFighterTier,
  { label: string; rankFloor: number; color: string }
> = {
  conqueror: { label: 'Conqueror', rankFloor: 90, color: '#f59e0b' },
  ace: { label: 'Ace', rankFloor: 80, color: '#34d399' },
  crown: { label: 'Crown', rankFloor: 70, color: '#38bdf8' },
  diamond: { label: 'Diamond', rankFloor: 60, color: '#67e8f9' },
  platinum: { label: 'Platinum', rankFloor: 50, color: '#94a3b8' },
  gold: { label: 'Gold', rankFloor: 40, color: '#fbbf24' },
  silver: { label: 'Silver', rankFloor: 25, color: '#cbd5e1' },
  bronze: { label: 'Bronze', rankFloor: 0, color: '#d97706' },
};

function normalizeYear(value: string | null | undefined): string {
  const t = value?.trim();
  return t || '—';
}

function normalizeBranch(value: string | null | undefined): string {
  const t = value?.trim();
  return t || '—';
}

function tierFromStats(avgPercent: number, winRate: number, wins: number): ContestFighterTier {
  if (wins >= 1 && winRate >= 50) return 'conqueror';
  if (avgPercent >= 90 || wins >= 2) return 'conqueror';
  if (avgPercent >= 80) return 'ace';
  if (avgPercent >= 70) return 'crown';
  if (avgPercent >= 60) return 'diamond';
  if (avgPercent >= 50) return 'platinum';
  if (avgPercent >= 40) return 'gold';
  if (avgPercent >= 25) return 'silver';
  return 'bronze';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Cross-contest tournament standings for the admin DSA Contests command centre.
 * Win = finished #1 on a contest leaderboard (by totalScore, then earliest submit).
 */
export async function adminContestTournament() {
  await ready();

  const [contests, attempts, submissions] = await Promise.all([
    prisma.dsaCodingContest.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        isPublished: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        _count: { select: { attempts: true, submissions: true, problems: true } },
      },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.dsaCodingContestAttempt.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            rollNumber: true,
            branch: true,
            academicYear: true,
            email: true,
          },
        },
      },
    }),
    prisma.dsaCodeSubmission.findMany({
      where: { contestId: { not: null } },
      select: {
        userId: true,
        contestId: true,
        contestAttemptId: true,
        language: true,
        status: true,
        scorePercent: true,
      },
    }),
  ]);

  type RankedAttempt = (typeof attempts)[number] & { contestRank: number };
  const byContest = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const list = byContest.get(a.contestId) ?? [];
    list.push(a);
    byContest.set(a.contestId, list);
  }

  const ranked: RankedAttempt[] = [];
  for (const [, list] of byContest) {
    const sorted = [...list].sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      const at = a.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bt = b.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
    sorted.forEach((a, i) => ranked.push({ ...a, contestRank: i + 1 }));
  }

  type FighterAcc = {
    userId: string;
    name: string | null;
    rollNumber: string | null;
    email: string | null;
    branch: string;
    year: string;
    contestsEntered: number;
    contestsCompleted: number;
    wins: number;
    totalSolved: number;
    totalScore: number;
    maxScore: number;
    percentSum: number;
    bestRank: number | null;
    javaSubs: number;
    pythonSubs: number;
    lastActiveAt: Date | null;
  };

  const fighters = new Map<string, FighterAcc>();

  for (const a of ranked) {
    const year = normalizeYear(a.user.academicYear);
    const branch = normalizeBranch(a.user.branch);
    const prev = fighters.get(a.userId);
    const pct = a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0;
    const completed = a.status === 'submitted' || a.status === 'expired';
    const win = a.contestRank === 1 && a.totalScore > 0;
    const last =
      a.submittedAt ?? a.updatedAt ?? a.startedAt ?? null;

    if (!prev) {
      fighters.set(a.userId, {
        userId: a.userId,
        name: a.user.fullName,
        rollNumber: a.user.rollNumber,
        email: a.user.email,
        branch,
        year,
        contestsEntered: 1,
        contestsCompleted: completed ? 1 : 0,
        wins: win ? 1 : 0,
        totalSolved: a.solvedCount,
        totalScore: a.totalScore,
        maxScore: a.maxScore,
        percentSum: pct,
        bestRank: a.contestRank,
        javaSubs: 0,
        pythonSubs: 0,
        lastActiveAt: last,
      });
    } else {
      prev.contestsEntered += 1;
      if (completed) prev.contestsCompleted += 1;
      if (win) prev.wins += 1;
      prev.totalSolved += a.solvedCount;
      prev.totalScore += a.totalScore;
      prev.maxScore += a.maxScore;
      prev.percentSum += pct;
      prev.bestRank =
        prev.bestRank == null ? a.contestRank : Math.min(prev.bestRank, a.contestRank);
      if (last && (!prev.lastActiveAt || last > prev.lastActiveAt)) {
        prev.lastActiveAt = last;
      }
    }
  }

  for (const s of submissions) {
    const f = fighters.get(s.userId);
    if (!f) continue;
    if (s.language === 'java') f.javaSubs += 1;
    if (s.language === 'python') f.pythonSubs += 1;
  }

  const standings = [...fighters.values()]
    .map((f) => {
      const avgPercent =
        f.contestsEntered > 0 ? round2(f.percentSum / f.contestsEntered) : 0;
      const winRate =
        f.contestsCompleted > 0
          ? round2((f.wins / f.contestsCompleted) * 100)
          : 0;
      const preferredLanguage =
        f.javaSubs === 0 && f.pythonSubs === 0
          ? '—'
          : f.javaSubs >= f.pythonSubs
            ? 'Java'
            : 'Python';
      const tier = tierFromStats(avgPercent, winRate, f.wins);
      const meta = TIER_META[tier];
      const levelProgress = Math.min(
        100,
        Math.round(((avgPercent - meta.rankFloor) / Math.max(10, 100 - meta.rankFloor)) * 100),
      );
      return {
        userId: f.userId,
        name: f.name,
        rollNumber: f.rollNumber,
        email: f.email,
        branch: f.branch,
        year: f.year,
        contestsEntered: f.contestsEntered,
        contestsCompleted: f.contestsCompleted,
        wins: f.wins,
        winRate,
        totalSolved: f.totalSolved,
        totalScore: f.totalScore,
        avgPercent,
        bestRank: f.bestRank,
        preferredLanguage,
        javaSubs: f.javaSubs,
        pythonSubs: f.pythonSubs,
        tier,
        tierLabel: meta.label,
        tierColor: meta.color,
        levelProgress: Math.max(8, levelProgress || 8),
        lastActiveAt: f.lastActiveAt?.toISOString() ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.avgPercent - a.avgPercent ||
        b.totalSolved - a.totalSolved ||
        (a.bestRank ?? 999) - (b.bestRank ?? 999),
    )
    .map((row, i) => ({ ...row, globalRank: i + 1 }));

  const yearSet = new Set(standings.map((s) => s.year));
  const branchSet = new Set(standings.map((s) => s.branch));

  const byYearMap = new Map<
    string,
    { year: string; fighters: number; solved: number; wins: number; percentSum: number }
  >();
  const byBranchMap = new Map<
    string,
    { branch: string; fighters: number; solved: number; wins: number; percentSum: number }
  >();

  for (const s of standings) {
    const y = byYearMap.get(s.year) ?? {
      year: s.year,
      fighters: 0,
      solved: 0,
      wins: 0,
      percentSum: 0,
    };
    y.fighters += 1;
    y.solved += s.totalSolved;
    y.wins += s.wins;
    y.percentSum += s.avgPercent;
    byYearMap.set(s.year, y);

    const b = byBranchMap.get(s.branch) ?? {
      branch: s.branch,
      fighters: 0,
      solved: 0,
      wins: 0,
      percentSum: 0,
    };
    b.fighters += 1;
    b.solved += s.totalSolved;
    b.wins += s.wins;
    b.percentSum += s.avgPercent;
    byBranchMap.set(s.branch, b);
  }

  const byYear = [...byYearMap.values()]
    .map((y) => ({
      year: y.year,
      fighters: y.fighters,
      solved: y.solved,
      wins: y.wins,
      avgPercent: y.fighters ? round2(y.percentSum / y.fighters) : 0,
    }))
    .sort((a, b) => a.year.localeCompare(b.year));

  const byBranch = [...byBranchMap.values()]
    .map((b) => ({
      branch: b.branch,
      fighters: b.fighters,
      solved: b.solved,
      wins: b.wins,
      avgPercent: b.fighters ? round2(b.percentSum / b.fighters) : 0,
    }))
    .sort((a, b) => b.fighters - a.fighters);

  const tierCounts: Record<ContestFighterTier, number> = {
    conqueror: 0,
    ace: 0,
    crown: 0,
    diamond: 0,
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
  };
  for (const s of standings) tierCounts[s.tier] += 1;

  const javaSubs = submissions.filter((s) => s.language === 'java');
  const pythonSubs = submissions.filter((s) => s.language === 'python');
  const avgScore =
    attempts.length > 0
      ? attempts.reduce((sum, a) => sum + (a.maxScore ? a.totalScore / a.maxScore : 0), 0) /
        attempts.length
      : 0;

  const liveContests = contests.filter((c) => c.isActive && c.isPublished).length;
  const publishedContests = contests.filter((c) => c.isPublished).length;

  return {
    summary: {
      totalContests: contests.length,
      publishedContests,
      liveContests,
      fighters: standings.length,
      chickenDinners: standings.reduce((s, x) => s + x.wins, 0),
      totalSubmissions: submissions.length,
      totalProblemsSolved: attempts.reduce((s, a) => s + a.solvedCount, 0),
      averageScorePercent: round2(avgScore * 100),
      javaAttempts: javaSubs.length,
      pythonAttempts: pythonSubs.length,
      javaSuccessRate:
        javaSubs.length > 0
          ? round2(
              (javaSubs.filter((s) => s.status === 'passed').length / javaSubs.length) * 100,
            )
          : 0,
      pythonSuccessRate:
        pythonSubs.length > 0
          ? round2(
              (pythonSubs.filter((s) => s.status === 'passed').length / pythonSubs.length) *
                100,
            )
          : 0,
    },
    yearOptions: ['all', ...[...yearSet].sort((a, b) => a.localeCompare(b))],
    branchOptions: ['all', ...[...branchSet].sort((a, b) => a.localeCompare(b))],
    byYear,
    byBranch,
    languageSplit: [
      { name: 'java', label: 'Java', value: javaSubs.length },
      { name: 'python', label: 'Python', value: pythonSubs.length },
    ],
    tierDistribution: (Object.keys(tierCounts) as ContestFighterTier[]).map((key) => ({
      name: key,
      label: TIER_META[key].label,
      value: tierCounts[key],
      color: TIER_META[key].color,
    })),
    standings,
    battles: contests.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      status: c.status,
      isLive: Boolean(c.isActive && c.isPublished),
      isPublished: c.isPublished,
      problemCount: c._count.problems,
      fighters: c._count.attempts,
      submissions: c._count.submissions,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
    })),
  };
}

export type AdminContestTournamentPayload = Awaited<ReturnType<typeof adminContestTournament>>;
