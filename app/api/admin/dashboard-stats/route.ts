import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  loadAdminStudentsPrisma,
  loadAllAttemptsRollupPrisma,
} from '@/lib/admin/attempts-rollup-prisma';
import { loadElevateXResultsForDateKeyPrisma } from '@/lib/admin/elevatex-results-prisma';
import { listLiveExamSchedulesPrisma } from '@/lib/admin/live-dashboard-prisma';
import { getTodayDateKeyInIST } from '@/lib/admin/report-date-filter';
import type { RollupAttempt } from '@/lib/admin/attempts-rollup';
import { ELEVATEX_TEST_ID } from '@/lib/elevatex';
import { averageScorePercent } from '@/lib/format-score';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const [students, rollup, categories, liveSchedules, elevatexToday] = await Promise.all([
    loadAdminStudentsPrisma(),
    loadAllAttemptsRollupPrisma(),
    prisma.testCategory.findMany({ select: { id: true, name: true, slug: true } }),
    listLiveExamSchedulesPrisma(),
    loadElevateXResultsForDateKeyPrisma(getTodayDateKeyInIST()),
  ]);

  let { attempts } = rollup;
  const attemptIds = new Set(attempts.map((a) => a.id));
  const elevatexMerged: RollupAttempt[] = [];
  for (const row of elevatexToday) {
    if (!row.submitted_at) continue;
    if (attemptIds.has(row.attempt_id)) continue;
    elevatexMerged.push({
      id: row.attempt_id,
      user_id: row.user_id,
      test_id: ELEVATEX_TEST_ID,
      test_name: `ElevateX · ${row.branch ?? 'Department'}`,
      score: row.overall_score,
      status: row.status,
      created_at: row.submitted_at,
      completed_at: row.submitted_at,
      time_taken: null,
      source: 'test_attempts',
    });
    attemptIds.add(row.attempt_id);
  }
  if (elevatexMerged.length > 0) {
    attempts = [...elevatexMerged, ...attempts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  const tests = await prisma.test.findMany({
    select: { id: true, title: true, name: true, categoryId: true },
    take: 2000,
  });

  const testList = tests.map((t) => ({
    id: t.id,
    name: String(t.title ?? t.name ?? `Test ${t.id}`),
    category_id: String(t.categoryId ?? ''),
  }));

  const categoryByTestId = new Map<string, string>();
  for (const t of testList) {
    const cat = categories.find((c) => c.id === t.category_id);
    categoryByTestId.set(t.id, cat?.slug ?? '');
  }

  const studentById = new Map(students.map((s) => [s.id, s]));
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let psychometricSubmitted = 0;
  const testsLast7Days = attempts.filter(
    (a) => new Date(a.created_at).getTime() >= sevenDaysAgo,
  ).length;

  const scoresByUser = new Map<string, number[]>();
  const studentStats = students.map((s) => ({
    ...s,
    attempts: 0,
    avgScore: 0,
    latestAttemptAt: null as string | null,
    highestScore: 0,
    highestTestName: null as string | null,
  }));
  const statsByUserId = new Map(studentStats.map((s) => [s.id, s]));

  for (const a of attempts) {
    const slug = (categoryByTestId.get(a.test_id ?? '') || '').toLowerCase();
    if (slug === 'psychometric') psychometricSubmitted += 1;

    const row = statsByUserId.get(a.user_id);
    if (!row) continue;
    row.attempts += 1;
    if (a.score > row.highestScore) {
      row.highestScore = a.score;
      row.highestTestName = a.test_name;
    }
    const activityAt = a.completed_at ?? a.created_at;
    if (
      activityAt &&
      (!row.latestAttemptAt || new Date(activityAt) > new Date(row.latestAttemptAt))
    ) {
      row.latestAttemptAt = activityAt;
    }
    if (!scoresByUser.has(a.user_id)) scoresByUser.set(a.user_id, []);
    scoresByUser.get(a.user_id)!.push(a.score);
  }

  for (const [userId, values] of scoresByUser.entries()) {
    const row = statsByUserId.get(userId);
    if (!row || values.length === 0) continue;
    row.avgScore = averageScorePercent(values);
  }

  const studentList = Array.from(statsByUserId.values());
  const attendedStudents = studentList.filter((s) => s.attempts > 0).length;

  return NextResponse.json({
    stats: {
      totalRegisteredUsers: students.length,
      totalStudentsAttended: attendedStudents,
      totalTestsSubmitted: attempts.length,
      avgTestsPerStudent:
        attendedStudents > 0 ? Number((attempts.length / attendedStudents).toFixed(1)) : 0,
      testsLast7Days,
      lowPerformers: studentList.filter((s) => s.attempts > 0 && s.avgScore < 40).length,
      psychometricSubmitted,
    },
    students: studentList,
    attempts: attempts.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      test_id: a.test_id,
      test_name: a.test_name,
      score: a.score,
      status: a.status,
      created_at: a.created_at,
      completed_at: a.completed_at,
      time_taken: a.time_taken,
      student: studentById.get(a.user_id) ?? null,
    })),
    tests: testList,
    categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    liveSchedules,
  });
}
