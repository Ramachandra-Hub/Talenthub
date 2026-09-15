import type { DsaContestExportWorkbook } from '@/lib/dsa/contest/admin-tournament-export';
import type { TableReportColumn } from '@/lib/reports/table-report';

export type ContestAnalyticsStudentRow = {
  rank: number;
  attemptId: string;
  name: string | null;
  rollNumber: string | null;
  email?: string | null;
  department: string | null;
  academicYear: string | null;
  status: string;
  solvedCount: number;
  attemptedCount: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  javaAttempts: number;
  pythonAttempts: number;
  submissionCount: number;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  problemResults: Array<{
    position: number;
    title: string;
    difficulty: string;
    status: string;
    scorePercent: number;
    language: string | null;
    submissionCount: number;
  }>;
};

function formatIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
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

/** Excel workbook for one contest's loaded analytics (admin UI). */
export function buildContestAnalyticsExportWorkbook(
  contestTitle: string,
  students: ContestAnalyticsStudentRow[],
): DsaContestExportWorkbook {
  const generatedAt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(new Date());

  const summaryCols: TableReportColumn[] = [
    { key: 'rank', header: 'Rank', align: 'right' },
    { key: 'name', header: 'Student name' },
    { key: 'rollNumber', header: 'Roll number' },
    { key: 'email', header: 'Email' },
    { key: 'branch', header: 'Branch' },
    { key: 'year', header: 'Year' },
    { key: 'status', header: 'Status' },
    { key: 'totalScore', header: 'Total score', align: 'right' },
    { key: 'maxScore', header: 'Max score', align: 'right' },
    { key: 'percentage', header: 'Score %', align: 'right' },
    { key: 'solvedCount', header: 'Solved', align: 'right' },
    { key: 'attemptedCount', header: 'Attempted', align: 'right' },
    { key: 'javaAttempts', header: 'Java subs', align: 'right' },
    { key: 'pythonAttempts', header: 'Python subs', align: 'right' },
    { key: 'submissionCount', header: 'Total submissions', align: 'right' },
    { key: 'startedAtIst', header: 'Started (IST)' },
    { key: 'submittedAtIst', header: 'Submitted (IST)' },
    { key: 'duration', header: 'Duration' },
    { key: 'attemptId', header: 'Attempt ID' },
  ];

  const summaryRows = students.map((s) => ({
    rank: s.rank,
    name: s.name ?? '—',
    rollNumber: s.rollNumber ?? '—',
    email: s.email ?? '—',
    branch: s.department ?? '—',
    year: s.academicYear ?? '—',
    status: s.status,
    totalScore: s.totalScore,
    maxScore: s.maxScore,
    percentage: `${s.percentage}%`,
    solvedCount: s.solvedCount,
    attemptedCount: s.attemptedCount,
    javaAttempts: s.javaAttempts,
    pythonAttempts: s.pythonAttempts,
    submissionCount: s.submissionCount,
    startedAtIst: formatIst(s.startedAt),
    submittedAtIst: formatIst(s.submittedAt),
    duration: formatDuration(s.durationSeconds),
    attemptId: s.attemptId,
  }));

  const challengeCols: TableReportColumn[] = [
    { key: 'rank', header: 'Student rank', align: 'right' },
    { key: 'name', header: 'Student name' },
    { key: 'rollNumber', header: 'Roll number' },
    { key: 'challengeNumber', header: 'Challenge #', align: 'right' },
    { key: 'challengeTitle', header: 'Challenge title' },
    { key: 'difficulty', header: 'Difficulty' },
    { key: 'status', header: 'Status' },
    { key: 'scorePercent', header: 'Best score %', align: 'right' },
    { key: 'language', header: 'Language' },
    { key: 'submissionCount', header: 'Attempts', align: 'right' },
  ];

  const challengeRows: Array<Record<string, string | number>> = [];
  for (const s of students) {
    for (const p of s.problemResults ?? []) {
      challengeRows.push({
        rank: s.rank,
        name: s.name ?? '—',
        rollNumber: s.rollNumber ?? '—',
        challengeNumber: p.position,
        challengeTitle: p.title,
        difficulty: p.difficulty,
        status: p.status,
        scorePercent: p.scorePercent,
        language: p.language ?? '—',
        submissionCount: p.submissionCount,
      });
    }
  }

  const slug = contestTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);

  return {
    title: `${contestTitle} — Student scores`,
    subtitle: contestTitle,
    generatedAt,
    fileBase: `dsa-contest-${slug || 'export'}`,
    sheets: [
      { name: 'Student Scores', columns: summaryCols, rows: summaryRows },
      { name: 'Challenges', columns: challengeCols, rows: challengeRows },
    ],
  };
}
