import { prisma } from '@/lib/prisma';
import { ensureDsaTables, ensureDsaSchemaExtensions } from '@/lib/dsa/ensure-tables';
import { ensureDsaContestTables } from '@/lib/dsa/contest/ensure-tables';
import type { TableReportColumn } from '@/lib/reports/table-report';
import {
  adminContestTournament,
  type AdminContestTournamentPayload,
} from '@/lib/dsa/contest/admin-tournament';

async function ready() {
  await ensureDsaTables();
  await ensureDsaSchemaExtensions();
  await ensureDsaContestTables();
}

function normalizeYear(value: string | null | undefined): string {
  const t = value?.trim();
  return t || '—';
}

function normalizeBranch(value: string | null | undefined): string {
  const t = value?.trim();
  return t || '—';
}

function formatIstDateTime(iso: Date | string | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type DsaContestExportSheet = {
  name: string;
  columns: TableReportColumn[];
  rows: Array<Record<string, string | number>>;
};

export type DsaContestExportWorkbook = {
  title: string;
  subtitle: string;
  generatedAt: string;
  fileBase: string;
  sheets: DsaContestExportSheet[];
};

function filterStanding(
  tournament: AdminContestTournamentPayload,
  year?: string | null,
  branch?: string | null,
) {
  return tournament.standings.filter((s) => {
    if (year && year !== 'all' && s.year !== year) return false;
    if (branch && branch !== 'all' && s.branch !== branch) return false;
    return true;
  });
}

/** Full multi-sheet export: summary, contest attempts, challenges, submission log. */
export async function adminContestTournamentExport(filters?: {
  year?: string | null;
  branch?: string | null;
}): Promise<DsaContestExportWorkbook> {
  await ready();
  const tournament = await adminContestTournament();
  const allowedUserIds = new Set(
    filterStanding(tournament, filters?.year, filters?.branch).map((s) => s.userId),
  );

  const filterLabel = [
    filters?.year && filters.year !== 'all' ? `Year: ${filters.year}` : null,
    filters?.branch && filters.branch !== 'all' ? `Branch: ${filters.branch}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const generatedAt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(new Date());

  const [contests, attempts, contestProblems, submissions] = await Promise.all([
    prisma.dsaCodingContest.findMany({
      select: { id: true, title: true, slug: true, status: true, startsAt: true, endsAt: true },
      orderBy: { title: 'asc' },
    }),
    prisma.dsaCodingContestAttempt.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            rollNumber: true,
            email: true,
            branch: true,
            academicYear: true,
          },
        },
        contest: { select: { title: true, slug: true } },
      },
      orderBy: [{ contestId: 'asc' }, { totalScore: 'desc' }],
    }),
    prisma.dsaCodingContestProblem.findMany({
      orderBy: [{ contestId: 'asc' }, { position: 'asc' }],
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            categoryLabel: true,
          },
        },
      },
    }),
    prisma.dsaCodeSubmission.findMany({
      where: { contestId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, rollNumber: true, email: true } },
        problem: { select: { title: true, difficulty: true } },
        contest: { select: { title: true, slug: true } },
      },
    }),
  ]);

  const problemsByContest = new Map<string, typeof contestProblems>();
  for (const link of contestProblems) {
    const list = problemsByContest.get(link.contestId) ?? [];
    list.push(link);
    problemsByContest.set(link.contestId, list);
  }

  const rankByContestAttempt = new Map<string, number>();
  const byContest = new Map<string, typeof attempts>();
  for (const a of attempts) {
    if (!allowedUserIds.has(a.userId)) continue;
    const list = byContest.get(a.contestId) ?? [];
    list.push(a);
    byContest.set(a.contestId, list);
  }
  for (const [, list] of byContest) {
    const sorted = [...list].sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      const at = a.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bt = b.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
    sorted.forEach((a, i) => rankByContestAttempt.set(a.id, i + 1));
  }

  const standingByUser = new Map(
    filterStanding(tournament, filters?.year, filters?.branch).map((s) => [s.userId, s]),
  );

  const summaryRows: Array<Record<string, string | number>> = [];
  for (const s of filterStanding(tournament, filters?.year, filters?.branch)) {
    summaryRows.push({
      globalRank: s.globalRank,
      name: s.name ?? '—',
      rollNumber: s.rollNumber ?? '—',
      email: s.email ?? '—',
      branch: s.branch,
      year: s.year,
      tier: s.tierLabel,
      contestsEntered: s.contestsEntered,
      contestsCompleted: s.contestsCompleted,
      wins: s.wins,
      winRate: `${s.winRate}%`,
      problemsSolved: s.totalSolved,
      avgScorePercent: `${s.avgPercent}%`,
      bestContestRank: s.bestRank ?? '—',
      preferredLanguage: s.preferredLanguage,
      javaSubmissions: s.javaSubs,
      pythonSubmissions: s.pythonSubs,
      lastActiveIst: s.lastActiveAt ? formatIstDateTime(s.lastActiveAt) : '—',
    });
  }

  const attemptRows: Array<Record<string, string | number>> = [];
  for (const a of attempts) {
    if (!allowedUserIds.has(a.userId)) continue;
    const pct = a.maxScore > 0 ? Math.round((a.totalScore / a.maxScore) * 10000) / 100 : 0;
    const standing = standingByUser.get(a.userId);
    attemptRows.push({
      contestTitle: a.contest.title,
      contestSlug: a.contest.slug,
      studentName: a.user.fullName ?? '—',
      rollNumber: a.user.rollNumber ?? '—',
      email: a.user.email ?? '—',
      branch: normalizeBranch(a.user.branch),
      year: normalizeYear(a.user.academicYear),
      globalRank: standing?.globalRank ?? '—',
      contestRank: rankByContestAttempt.get(a.id) ?? '—',
      tier: standing?.tierLabel ?? '—',
      status: a.status,
      totalScore: a.totalScore,
      maxScore: a.maxScore,
      scorePercent: `${pct}%`,
      solvedCount: a.solvedCount,
      attemptedCount: a.attemptedCount,
      startedAtIst: formatIstDateTime(a.startedAt),
      submittedAtIst: formatIstDateTime(a.submittedAt),
      duration: formatDuration(a.durationSeconds),
      attemptId: a.id,
    });
  }

  const subsByAttempt = new Map<string, typeof submissions>();
  for (const sub of submissions) {
    if (!sub.contestAttemptId || !allowedUserIds.has(sub.userId)) continue;
    const list = subsByAttempt.get(sub.contestAttemptId) ?? [];
    list.push(sub);
    subsByAttempt.set(sub.contestAttemptId, list);
  }

  const challengeRows: Array<Record<string, string | number>> = [];
  for (const a of attempts) {
    if (!allowedUserIds.has(a.userId)) continue;
    const problems = problemsByContest.get(a.contestId) ?? [];
    const attemptSubs = subsByAttempt.get(a.id) ?? [];
    const bestByProblem = new Map<string, (typeof attemptSubs)[number]>();
    for (const sub of attemptSubs) {
      const prev = bestByProblem.get(sub.problemId);
      if (!prev || Number(sub.scorePercent) > Number(prev.scorePercent)) {
        bestByProblem.set(sub.problemId, sub);
      }
    }
    for (const link of problems) {
      const best = bestByProblem.get(link.problemId) ?? null;
      const solved = best
        ? best.status === 'passed' || Number(best.scorePercent) >= 100
        : false;
      const probSubs = attemptSubs.filter((s) => s.problemId === link.problemId);
      const lastSub = probSubs[0];
      challengeRows.push({
        contestTitle: a.contest.title,
        studentName: a.user.fullName ?? '—',
        rollNumber: a.user.rollNumber ?? '—',
        branch: normalizeBranch(a.user.branch),
        year: normalizeYear(a.user.academicYear),
        challengeNumber: link.position,
        challengeTitle: link.problem.title,
        difficulty: link.problem.difficulty,
        category: link.problem.categoryLabel ?? '—',
        status: best ? (solved ? 'solved' : 'failed') : 'not_attempted',
        bestScorePercent: best ? Number(best.scorePercent) : 0,
        language: best?.language ?? '—',
        submissionAttempts: probSubs.length,
        lastAttemptIst: lastSub ? formatIstDateTime(lastSub.createdAt) : '—',
        contestStartedIst: formatIstDateTime(a.startedAt),
        contestSubmittedIst: formatIstDateTime(a.submittedAt),
      });
    }
  }

  const submissionRows: Array<Record<string, string | number>> = [];
  for (const sub of submissions) {
    if (!allowedUserIds.has(sub.userId)) continue;
    submissionRows.push({
      submittedAtIst: formatIstDateTime(sub.createdAt),
      studentName: sub.user.fullName ?? '—',
      rollNumber: sub.user.rollNumber ?? '—',
      email: sub.user.email ?? '—',
      contestTitle: sub.contest?.title ?? '—',
      challengeTitle: sub.problem.title,
      difficulty: sub.problem.difficulty,
      language: sub.language,
      status: sub.status,
      scorePercent: Number(sub.scorePercent),
      passed: sub.passed,
      totalTests: sub.total,
      compileOk: sub.compileOk == null ? '—' : sub.compileOk ? 'yes' : 'no',
      failureType: sub.failureType ?? '—',
      runtimeMs: sub.runtimeMs ?? '—',
      submissionId: sub.id,
    });
  }

  const contestMetaRows: Array<Record<string, string | number>> = contests.map((c) => {
    const battle = tournament.battles.find((b) => b.id === c.id);
    return {
      contestTitle: c.title,
      slug: c.slug,
      status: c.status,
      startsAtIst: formatIstDateTime(c.startsAt),
      endsAtIst: formatIstDateTime(c.endsAt),
      problemCount: battle?.problemCount ?? 0,
      participants: battle?.fighters ?? 0,
      submissions: battle?.submissions ?? 0,
      isLive: battle?.isLive ? 'yes' : 'no',
    };
  });

  const sheets: DsaContestExportSheet[] = [
    {
      name: 'Student Summary',
      columns: [
        { key: 'globalRank', header: 'Global rank', align: 'right' },
        { key: 'name', header: 'Student name' },
        { key: 'rollNumber', header: 'Roll number' },
        { key: 'email', header: 'Email' },
        { key: 'branch', header: 'Branch' },
        { key: 'year', header: 'Year' },
        { key: 'tier', header: 'Tier / level' },
        { key: 'contestsEntered', header: 'Contests entered', align: 'right' },
        { key: 'contestsCompleted', header: 'Contests completed', align: 'right' },
        { key: 'wins', header: 'Wins (#1)', align: 'right' },
        { key: 'winRate', header: 'Win rate', align: 'right' },
        { key: 'problemsSolved', header: 'Problems solved', align: 'right' },
        { key: 'avgScorePercent', header: 'Avg score %', align: 'right' },
        { key: 'bestContestRank', header: 'Best contest rank', align: 'right' },
        { key: 'preferredLanguage', header: 'Preferred language' },
        { key: 'javaSubmissions', header: 'Java submissions', align: 'right' },
        { key: 'pythonSubmissions', header: 'Python submissions', align: 'right' },
        { key: 'lastActiveIst', header: 'Last active (IST)' },
      ],
      rows: summaryRows,
    },
    {
      name: 'Contest Attempts',
      columns: [
        { key: 'contestTitle', header: 'Contest / challenge event' },
        { key: 'contestSlug', header: 'Contest slug' },
        { key: 'studentName', header: 'Student name' },
        { key: 'rollNumber', header: 'Roll number' },
        { key: 'email', header: 'Email' },
        { key: 'branch', header: 'Branch' },
        { key: 'year', header: 'Year' },
        { key: 'globalRank', header: 'Global rank', align: 'right' },
        { key: 'contestRank', header: 'Rank in contest', align: 'right' },
        { key: 'tier', header: 'Tier' },
        { key: 'status', header: 'Attempt status' },
        { key: 'totalScore', header: 'Total score', align: 'right' },
        { key: 'maxScore', header: 'Max score', align: 'right' },
        { key: 'scorePercent', header: 'Score %', align: 'right' },
        { key: 'solvedCount', header: 'Solved', align: 'right' },
        { key: 'attemptedCount', header: 'Attempted', align: 'right' },
        { key: 'startedAtIst', header: 'Started (IST)' },
        { key: 'submittedAtIst', header: 'Submitted (IST)' },
        { key: 'duration', header: 'Duration (min:sec)' },
        { key: 'attemptId', header: 'Attempt ID' },
      ],
      rows: attemptRows,
    },
    {
      name: 'Challenges Performed',
      columns: [
        { key: 'contestTitle', header: 'Contest' },
        { key: 'studentName', header: 'Student name' },
        { key: 'rollNumber', header: 'Roll number' },
        { key: 'branch', header: 'Branch' },
        { key: 'year', header: 'Year' },
        { key: 'challengeNumber', header: 'Challenge #', align: 'right' },
        { key: 'challengeTitle', header: 'Challenge / problem' },
        { key: 'difficulty', header: 'Difficulty' },
        { key: 'category', header: 'Category' },
        { key: 'status', header: 'Result status' },
        { key: 'bestScorePercent', header: 'Best score %', align: 'right' },
        { key: 'language', header: 'Language used' },
        { key: 'submissionAttempts', header: 'Submit attempts', align: 'right' },
        { key: 'lastAttemptIst', header: 'Last attempt (IST)' },
        { key: 'contestStartedIst', header: 'Contest started (IST)' },
        { key: 'contestSubmittedIst', header: 'Contest finished (IST)' },
      ],
      rows: challengeRows,
    },
    {
      name: 'Submission Log',
      columns: [
        { key: 'submittedAtIst', header: 'Date & time (IST)' },
        { key: 'studentName', header: 'Student name' },
        { key: 'rollNumber', header: 'Roll number' },
        { key: 'email', header: 'Email' },
        { key: 'contestTitle', header: 'Contest' },
        { key: 'challengeTitle', header: 'Challenge' },
        { key: 'difficulty', header: 'Difficulty' },
        { key: 'language', header: 'Language' },
        { key: 'status', header: 'Status' },
        { key: 'scorePercent', header: 'Score %', align: 'right' },
        { key: 'passed', header: 'Tests passed', align: 'right' },
        { key: 'totalTests', header: 'Total tests', align: 'right' },
        { key: 'compileOk', header: 'Compile OK' },
        { key: 'failureType', header: 'Failure type' },
        { key: 'runtimeMs', header: 'Runtime ms', align: 'right' },
        { key: 'submissionId', header: 'Submission ID' },
      ],
      rows: submissionRows,
    },
    {
      name: 'Contests Catalog',
      columns: [
        { key: 'contestTitle', header: 'Contest title' },
        { key: 'slug', header: 'Slug' },
        { key: 'status', header: 'Status' },
        { key: 'startsAtIst', header: 'Starts (IST)' },
        { key: 'endsAtIst', header: 'Ends (IST)' },
        { key: 'problemCount', header: 'Challenges', align: 'right' },
        { key: 'participants', header: 'Participants', align: 'right' },
        { key: 'submissions', header: 'Submissions', align: 'right' },
        { key: 'isLive', header: 'Live now' },
      ],
      rows: contestMetaRows,
    },
  ];

  return {
    title: 'DSA Contest Tournament — Student Scores',
    subtitle: filterLabel || 'All students · all contests',
    generatedAt,
    fileBase: 'dsa-contest-student-scores',
    sheets,
  };
}
