'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  averageScorePercent,
  formatScorePercentLabel,
  roundRatePercent,
  roundScorePercent,
} from '@/lib/format-score';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { LiveExamDashboard } from '@/components/admin/live-exam-dashboard';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { StatDetailReportModal } from '@/components/reports/stat-detail-report-modal';
import { AdminAttendanceReportModal } from '@/components/admin/admin-attendance-report-modal';
import { AdminTestDetailModal } from '@/components/admin/admin-test-detail-modal';
import {
  buildAttendanceDayRows,
  summarizeAttendanceDay,
} from '@/lib/admin/attendance-report';
import {
  buildAdminDashboardCardReport,
  type AdminDashboardCardKey,
  type AdminDashboardReportContext,
} from '@/lib/admin/dashboard-card-reports';
import { buildDashboardTestOverviewItem } from '@/lib/admin/dashboard-test-report';
import { readJsonResponse } from '@/lib/fetch-json';
import { getTodayDateKeyInIST, formatDateKeyLabel } from '@/lib/admin/report-date-filter';
import type { AdminTestOverviewItem } from '@/lib/admin/tests-overview-data';

type DashboardStudent = {
  id: string;
  email: string;
  full_name: string | null;
  created_at?: string;
  roll_number?: string;
  branch?: string | null;
  academic_year?: string | null;
  attempts: number;
  avgScore: number;
  latestAttemptAt: string | null;
  highestScore: number;
  highestTestName: string | null;
};

type DashboardAttemptRow = {
  id: string | number;
  user_id?: string;
  test_id?: string | number | null;
  test_name?: string;
  score?: number | null;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  time_taken?: number | null;
};

export function AdminDashboard() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rdsEnvMissing, setDbEnvMissing] = useState(false);
  const [stats, setStats] = useState({
    totalRegisteredUsers: 0,
    totalStudentsAttended: 0,
    totalTestsSubmitted: 0,
    avgTestsPerStudent: 0,
    testsLast7Days: 0,
    lowPerformers: 0,
    psychometricSubmitted: 0,
  });
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [testsMap, setTestsMap] = useState<Map<string, { name: string; category_id: string }>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTest, setSelectedTest] = useState('all');
  const [search, setSearch] = useState('');
  const [recentStudents, setRecentStudents] = useState<DashboardStudent[]>([]);
  const [topStudents, setTopStudents] = useState<DashboardStudent[]>([]);
  const [allStudents, setAllStudents] = useState<DashboardStudent[]>([]);
  const [allAttempts, setAllAttempts] = useState<DashboardAttemptRow[]>([]);
  const [detailCard, setDetailCard] = useState<AdminDashboardCardKey | null>(null);
  const [selectedTestDetail, setSelectedTestDetail] = useState<AdminTestOverviewItem | null>(null);
  const [testDetailModalOpen, setTestDetailModalOpen] = useState(false);
  const [testDetailScopeUserIds, setTestDetailScopeUserIds] = useState<string[] | undefined>(
    undefined,
  );
  const [attendanceDateKey, setAttendanceDateKey] = useState(() => getTodayDateKeyInIST());
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const meRes = await fetch('/api/admin/me', { credentials: 'include' });
        const { json: me } = await readJsonResponse<{ isAdmin?: boolean; hint?: string }>(meRes);
        if (!meRes.ok || !me.isAdmin) {
          if (me.hint) console.error('[admin dashboard]', me.hint);
          router.push('/auth/login/admin');
          return;
        }

        setIsAdmin(true);

        const statsRes = await fetch('/api/admin/dashboard-stats', { credentials: 'include' });
        if (!statsRes.ok) {
          throw new Error('Failed to load dashboard stats');
        }
        const payload = (await statsRes.json()) as {
          stats: typeof stats;
          students: DashboardStudent[];
          attempts: DashboardAttemptRow[];
          tests: Array<{ id: string; name: string; category_id: string }>;
          categories: Array<{ id: string; name: string; slug: string }>;
        };

        setAllAttempts(payload.attempts ?? []);
        const testsById = new Map<string, { name: string; category_id: string }>();
        for (const t of payload.tests ?? []) {
          testsById.set(String(t.id), {
            name: t.name,
            category_id: t.category_id ?? '',
          });
        }
        setTestsMap(testsById);
        setCategories(payload.categories ?? []);

        const students = payload.students ?? [];
        const recent = [...students]
          .sort((a, b) => {
            const bt = b.latestAttemptAt ? new Date(b.latestAttemptAt).getTime() : 0;
            const at = a.latestAttemptAt ? new Date(a.latestAttemptAt).getTime() : 0;
            return bt - at;
          })
          .slice(0, 8);
        const top = [...students]
          .filter((s) => s.attempts > 0)
          .sort((a, b) => b.highestScore - a.highestScore)
          .slice(0, 5);

        setStats(payload.stats);
        setRecentStudents(recent);
        setTopStudents(top);
        setAllStudents(students);
      } catch (error) {
        console.error('Error loading admin dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    const reloadStats = async () => {
      try {
        const statsRes = await fetch('/api/admin/dashboard-stats', { credentials: 'include' });
        if (!statsRes.ok) return;
        const payload = (await statsRes.json()) as {
          stats: typeof stats;
          students: DashboardStudent[];
          attempts: DashboardAttemptRow[];
          tests: Array<{ id: string; name: string; category_id: string }>;
          categories: Array<{ id: string; name: string; slug: string }>;
        };
        setAllAttempts(payload.attempts ?? []);
        const testsById = new Map<string, { name: string; category_id: string }>();
        for (const t of payload.tests ?? []) {
          testsById.set(String(t.id), { name: t.name, category_id: t.category_id ?? '' });
        }
        setTestsMap(testsById);
        setCategories(payload.categories ?? []);
        setStats(payload.stats);
        setAllStudents(payload.students ?? []);
        const recent = [...(payload.students ?? [])]
          .sort((a, b) => {
            const bt = b.latestAttemptAt ? new Date(b.latestAttemptAt).getTime() : 0;
            const at = a.latestAttemptAt ? new Date(a.latestAttemptAt).getTime() : 0;
            return bt - at;
          })
          .slice(0, 8);
        const top = [...(payload.students ?? [])]
          .filter((s) => s.attempts > 0)
          .sort((a, b) => b.highestScore - a.highestScore)
          .slice(0, 5);
        setRecentStudents(recent);
        setTopStudents(top);
      } catch {
        // ignore background refresh errors
      }
    };

    void checkAdminAccess();
    const refreshTimer = setInterval(() => void reloadStats(), 5000);
    return () => clearInterval(refreshTimer);
  }, [router]);

  const resetForExamDay = async () => {
    if (
      !window.confirm(
        'Remove ALL student and faculty logins and clear every attempt, roster, and session? Admin accounts are kept. This cannot be undone.',
      )
    ) {
      return;
    }
    setResetLoading(true);
    setResetMessage(null);
    try {
      const res = await fetch('/api/admin/reset-all-students', {
        method: 'POST',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Reset failed');
      setResetMessage(json.message ?? 'All student data cleared. Admin dashboard refreshed.');
      window.location.reload();
    } catch (err) {
      setResetMessage(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetLoading(false);
    }
  };

  const filteredStudentsForModal = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStudents.filter((student) => {
      if (q && !(student.full_name || student.email).toLowerCase().includes(q)) return false;
      if (selectedTest !== 'all') {
        const wanted = testsMap.get(selectedTest)?.name;
        if (!wanted || student.highestTestName !== wanted) return false;
      }
      if (selectedCategory !== 'all') {
        const cat = categories.find((c) => c.slug === selectedCategory);
        if (!cat) return true;
        const matchedTest = Array.from(testsMap.entries()).find(
          ([, t]) => t.name === student.highestTestName,
        );
        if (!matchedTest) return false;
        if (matchedTest[1].category_id !== cat.id) return false;
      }
      return true;
    });
  }, [allStudents, search, selectedTest, selectedCategory, testsMap, categories]);

  const reportContextForModal = useMemo((): AdminDashboardReportContext => {
    const categorySlugByTestId = new Map<string, string>();
    const categoryNameByTestId = new Map<string, string>();
    for (const [testId, test] of testsMap.entries()) {
      const cat = categories.find((c) => c.id === test.category_id);
      categorySlugByTestId.set(testId, cat?.slug ?? '');
      categoryNameByTestId.set(testId, cat?.name ?? '');
    }
    const inactiveCount = allStudents.filter((s) => s.attempts === 0).length;
    const attendanceRate =
      stats.totalRegisteredUsers > 0
        ? roundRatePercent((stats.totalStudentsAttended / stats.totalRegisteredUsers) * 100)
        : 0;
    const passedCount = allAttempts.filter((a) => Number(a.score ?? 0) >= 40).length;
    const passRate =
      allAttempts.length > 0
        ? roundRatePercent((passedCount / allAttempts.length) * 100)
        : 0;
    const overallAverageScore =
      allAttempts.length > 0
        ? averageScorePercent(allAttempts.map((a) => Number(a.score ?? 0)))
        : 0;

    return {
      stats,
      students: allStudents,
      attempts: allAttempts,
      categories,
      categorySlugByTestId,
      categoryNameByTestId,
      testsMap,
      attendanceRate,
      overallAverageScore,
      passRate,
      passedCount,
      inactiveCount,
    };
  }, [stats, allStudents, allAttempts, categories, testsMap]);

  const detailReportForModal = useMemo(
    () =>
      detailCard ? buildAdminDashboardCardReport(detailCard, reportContextForModal) : null,
    [detailCard, reportContextForModal],
  );

  const dashboardModals = isAdmin ? (
    <>
      <StatDetailReportModal
        open={detailCard != null}
        onClose={() => setDetailCard(null)}
        report={detailReportForModal}
        fileBase={detailCard ? `admin-${detailCard}` : undefined}
      />
      <AdminTestDetailModal
        test={selectedTestDetail}
        open={testDetailModalOpen}
        onOpenChange={setTestDetailModalOpen}
        scopeUserIds={testDetailScopeUserIds}
      />
      <AdminAttendanceReportModal
        open={attendanceModalOpen}
        onClose={() => setAttendanceModalOpen(false)}
        dateKey={attendanceDateKey}
        onDateKeyChange={setAttendanceDateKey}
        students={filteredStudentsForModal}
        attempts={allAttempts}
      />
    </>
  ) : null;

  if (loading) {
    return (
      <>
        {dashboardModals}
        <LiveExamDashboard />
        <LoadingScreen message="Loading admin dashboard…" className="min-h-[40vh]" />
      </>
    );
  }

  if (rdsEnvMissing) {
    return (
      <>
        {dashboardModals}
        <div className="lux-loading-screen min-h-[60vh] px-4">
          <p className="text-center max-w-lg text-slate-600">{'Configure AUTH_SECRET and DATABASE_URL'}</p>
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return <LoadingScreen message="Access denied" className="min-h-[60vh]" />;
  }

  const filteredTopStudents = topStudents.filter((student) => {
    const q = search.trim().toLowerCase();
    if (q && !(student.full_name || student.email).toLowerCase().includes(q)) return false;
    if (selectedTest !== 'all') {
      const wanted = testsMap.get(selectedTest)?.name;
      if (!wanted || student.highestTestName !== wanted) return false;
    }
    if (selectedCategory !== 'all') {
      const cat = categories.find((c) => c.slug === selectedCategory);
      if (!cat) return true;
      const matchedTest = Array.from(testsMap.entries()).find(([, t]) => t.name === student.highestTestName);
      if (!matchedTest) return false;
      if (matchedTest[1].category_id !== cat.id) return false;
    }
    return true;
  });

  const filteredStudents = allStudents.filter((student) => {
    const q = search.trim().toLowerCase();
    if (q && !(student.full_name || student.email).toLowerCase().includes(q)) return false;
    if (selectedTest !== 'all') {
      const wanted = testsMap.get(selectedTest)?.name;
      if (!wanted || student.highestTestName !== wanted) return false;
    }
    if (selectedCategory !== 'all') {
      const cat = categories.find((c) => c.slug === selectedCategory);
      if (!cat) return true;
      const matchedTest = Array.from(testsMap.entries()).find(([, t]) => t.name === student.highestTestName);
      if (!matchedTest) return false;
      if (matchedTest[1].category_id !== cat.id) return false;
    }
    return true;
  });

  const selectedCategoryId =
    selectedCategory === 'all' ? null : categories.find((c) => c.slug === selectedCategory)?.id ?? null;
  const filteredStudentIds = new Set(filteredStudents.map((s) => s.id));
  const filteredAttempts = allAttempts.filter((attempt) => {
    const userId = String(attempt.user_id ?? '');
    if (!filteredStudentIds.has(userId)) return false;
    const testId = String(attempt.test_id ?? '');
    if (selectedTest !== 'all' && selectedTest !== testId) return false;
    if (selectedCategoryId) {
      const test = testsMap.get(testId);
      if (!test || test.category_id !== selectedCategoryId) return false;
    }
    return true;
  });

  const studentsWithAttempts = filteredStudents.filter((s) => s.attempts > 0);
  const attendanceRate =
    stats.totalRegisteredUsers > 0
      ? roundRatePercent((stats.totalStudentsAttended / stats.totalRegisteredUsers) * 100)
      : 0;
  const inactiveStudents = allStudents.filter((s) => s.attempts === 0).length;
  const overallAverageScore =
    filteredAttempts.length > 0
      ? averageScorePercent(filteredAttempts.map((a) => Number(a.score ?? 0)))
      : 0;
  const passedCount = filteredAttempts.filter((a) => Number(a.score ?? 0) >= 40).length;
  const passRate =
    filteredAttempts.length > 0
      ? roundRatePercent((passedCount / filteredAttempts.length) * 100)
      : 0;

  const scoreBands = [
    {
      label: '90 - 100 (Excellent)',
      count: studentsWithAttempts.filter((s) => s.avgScore >= 90).length,
      tone: 'text-emerald-700',
    },
    {
      label: '75 - 89 (Strong)',
      count: studentsWithAttempts.filter((s) => s.avgScore >= 75 && s.avgScore < 90).length,
      tone: 'text-green-700',
    },
    {
      label: '40 - 74 (Average)',
      count: studentsWithAttempts.filter((s) => s.avgScore >= 40 && s.avgScore < 75).length,
      tone: 'text-amber-700',
    },
    {
      label: '0 - 39 (Needs support)',
      count: studentsWithAttempts.filter((s) => s.avgScore < 40).length,
      tone: 'text-red-700',
    },
  ];

  const testWisePerformance = Array.from(
    filteredAttempts.reduce((acc, attempt) => {
      const testId = String(attempt.test_id ?? '');
      if (!acc.has(testId)) {
        acc.set(testId, { attempts: 0, totalScore: 0, highest: 0, passed: 0 });
      }
      const row = acc.get(testId)!;
      const score = Number(attempt.score ?? 0);
      row.attempts += 1;
      row.totalScore += score;
      row.highest = Math.max(row.highest, score);
      if (score >= 40) row.passed += 1;
      return acc;
    }, new Map<string, { attempts: number; totalScore: number; highest: number; passed: number }>())
  )
    .map(([testId, row]) => {
      const sample = filteredAttempts.find((a) => String(a.test_id ?? '') === testId);
      return {
        testId,
        testName: sample?.test_name ?? testsMap.get(testId)?.name ?? `Test ${testId}`,
        attempts: row.attempts,
        avgScore: averageScorePercent(
          filteredAttempts
            .filter((a) => String(a.test_id ?? '') === testId)
            .map((a) => Number(a.score ?? 0)),
        ),
        highestScore: roundScorePercent(row.highest),
        passRate: roundRatePercent((row.passed / row.attempts) * 100),
      };
    })
    .sort((a, b) => b.attempts - a.attempts);

  const recentAttemptsFeed = [...filteredAttempts]
    .sort((a, b) => {
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, 12)
    .map((attempt) => {
      const student = allStudents.find((s) => s.id === String(attempt.user_id ?? ''));
      const testName =
        attempt.test_name ??
        testsMap.get(String(attempt.test_id ?? ''))?.name ??
        `Test ${String(attempt.test_id ?? '-')}`;
      return {
        id: String(attempt.id ?? ''),
        studentName: student?.full_name || student?.email || 'Unknown student',
        studentEmail: student?.email || '-',
        testName,
        score: Number(attempt.score ?? 0),
        status: String(attempt.status ?? '-'),
        createdAt: attempt.created_at,
      };
    });

  const categorySlugByTestId = new Map<string, string>();
  const categoryNameByTestId = new Map<string, string>();
  for (const [testId, test] of testsMap.entries()) {
    const cat = categories.find((c) => c.id === test.category_id);
    categorySlugByTestId.set(testId, cat?.slug ?? '');
    categoryNameByTestId.set(testId, cat?.name ?? '');
  }

  const attendanceDayRows = buildAttendanceDayRows(
    attendanceDateKey,
    filteredStudents,
    allAttempts,
  );
  const attendanceDaySummary = summarizeAttendanceDay(
    attendanceDateKey,
    filteredStudents,
    allAttempts,
  );

  const openAttendanceReport = (dateKey?: string) => {
    if (dateKey) setAttendanceDateKey(dateKey);
    setAttendanceModalOpen(true);
  };

  const openTestWiseDetails = (row: (typeof testWisePerformance)[0]) => {
    const categorySlug = categorySlugByTestId.get(row.testId) ?? '';
    const scopeUserIds = [
      ...new Set(
        filteredAttempts
          .filter((a) => String(a.test_id ?? '') === row.testId && a.user_id)
          .map((a) => String(a.user_id)),
      ),
    ];
    setSelectedTestDetail(
      buildDashboardTestOverviewItem({
        testId: row.testId,
        testName: row.testName,
        attempts: row.attempts,
        avgScore: row.avgScore,
        categorySlug,
      }),
    );
    setTestDetailScopeUserIds(scopeUserIds.length > 0 ? scopeUserIds : undefined);
    setTestDetailModalOpen(true);
  };

  const openCard = (key: AdminDashboardCardKey) => setDetailCard(key);

  const exportFullReportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];
    const generatedAt = new Date().toLocaleString();

    lines.push('Admin Dashboard Report');
    lines.push(`Generated At,${escape(generatedAt)}`);
    lines.push(`Registered Users,${stats.totalRegisteredUsers}`);
    lines.push(`Students With Attempts,${stats.totalStudentsAttended}`);
    lines.push(`Total Tests Submitted,${stats.totalTestsSubmitted}`);
    lines.push(`Average Tests Per Student,${stats.avgTestsPerStudent}`);
    lines.push(`Tests Submitted Last 7 Days,${stats.testsLast7Days}`);
    lines.push(`Need Attention (avg < 40),${stats.lowPerformers}`);
    lines.push('');

    lines.push('Student Performance');
    lines.push('Student Name,Email,Attempts,Average Score,Highest Score,Highest Test,Latest Attempt');
    for (const student of filteredStudents) {
      lines.push(
        [
          escape(student.full_name || '-'),
          escape(student.email),
          student.attempts,
          student.avgScore,
          student.highestScore,
          escape(student.highestTestName || '-'),
          escape(student.latestAttemptAt ? new Date(student.latestAttemptAt).toLocaleString() : '-'),
        ].join(',')
      );
    }
    lines.push('');

    lines.push('Attempt Level Details');
    lines.push('Attempt ID,Student Name,Student Email,Test Name,Category,Score,Status,Created At,Completed At,Time Taken (min)');
    const userById = new Map(filteredStudents.map((s) => [s.id, s]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    for (const attempt of filteredAttempts) {
      const userId = String(attempt.user_id ?? '');
      const student = userById.get(userId);
      if (!student) continue;
      const test = testsMap.get(String(attempt.test_id ?? ''));
      const categoryName = test?.category_id ? categoryById.get(test.category_id)?.name ?? '-' : '-';
      lines.push(
        [
          escape(String(attempt.id ?? '')),
          escape(student.full_name || '-'),
          escape(student.email),
          escape(test?.name || `Test ${String(attempt.test_id ?? '-')}`),
          escape(categoryName),
          Number(attempt.score ?? 0),
          escape(String(attempt.status ?? '-')),
          escape(attempt.created_at ? new Date(attempt.created_at).toLocaleString() : '-'),
          escape(attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : '-'),
          Math.round(Number(attempt.time_taken ?? 0) / 60),
        ].join(',')
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-dashboard-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {dashboardModals}
      <LiveExamDashboard />
      <Card className="mb-6 border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-950">Exam day prep</p>
          <p className="text-sm text-amber-900/80 mt-0.5">
            Remove all demo student logins (including EXS1001–1042), clear attempts and rosters. Keeps admin only.
          </p>
          {resetMessage ? <p className="text-xs text-amber-800 mt-2">{resetMessage}</p> : null}
        </div>
        <Button
          variant="outline"
          className="border-amber-300 text-amber-950 hover:bg-amber-100 shrink-0"
          disabled={resetLoading}
          onClick={() => void resetForExamDay()}
        >
          {resetLoading ? 'Clearing…' : 'Clear all students & reset admin data'}
        </Button>
      </Card>
      <AdminPageHeader
        title="Overview"
        description="College-wide performance, attendance, and exports"
        actions={
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" asChild>
              <Link href="/admin/reports?type=elevatex&today=1">ElevateX today</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/reports">Per-test reports</Link>
            </Button>
            <Button onClick={exportFullReportCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Export full report (CSV)
            </Button>
          </div>
        }
      />
      <div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
          <StatCard
            className="sm:col-span-2"
            label="Registered users"
            value={stats.totalRegisteredUsers}
            accent="navy"
            onClick={() => openCard('registered_users')}
          />
          <StatCard
            label="Students with attempts"
            value={stats.totalStudentsAttended}
            accent="blue"
            onClick={() => openCard('students_with_attempts')}
          />
          <StatCard
            label="Tests submitted"
            value={stats.totalTestsSubmitted}
            accent="navy"
            onClick={() => openCard('tests_submitted')}
          />
          <StatCard
            label="Avg tests / student"
            value={stats.avgTestsPerStudent}
            accent="emerald"
            onClick={() => openCard('avg_tests_per_student')}
          />
          <StatCard
            label="Tests (7 days)"
            value={stats.testsLast7Days}
            accent="cyan"
            onClick={() => openCard('tests_last_7_days')}
          />
          <StatCard
            label="Need attention"
            value={stats.lowPerformers}
            accent="red"
            onClick={() => openCard('low_performers')}
          />
          <StatCard
            label="Psychometric"
            value={stats.psychometricSubmitted}
            accent="indigo"
            onClick={() => openCard('psychometric')}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <h2 className="app-section-title mb-4">Recent student activity</h2>
            {recentStudents.length === 0 ? (
              <p className="text-sm text-slate-600">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {recentStudents.map((student) => (
                  <div key={student.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <p className="font-medium text-[#0c2340]">{student.full_name || student.email}</p>
                      <p className="text-xs text-slate-500">
                        {student.latestAttemptAt
                          ? `Last attempt: ${new Date(student.latestAttemptAt).toLocaleString()}`
                          : 'No attempts yet'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#0c2340]">{student.attempts} tests</p>
                      <p className="text-xs text-slate-500">Avg {formatScorePercentLabel(student.avgScore)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-bold text-[#0c2340] mb-4">Highest score per student</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-[#0c2340] bg-white"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedTest}
                onChange={(e) => setSelectedTest(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-[#0c2340] bg-white"
              >
                <option value="all">All tests</option>
                {Array.from(testsMap.entries()).map(([id, t]) => (
                  <option key={id} value={id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student..." />
            </div>
            {filteredTopStudents.length === 0 ? (
              <p className="text-sm text-slate-600">No completed attempts yet.</p>
            ) : (
              <div className="space-y-3">
                {filteredTopStudents.map((student, index) => (
                  <div key={student.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <p className="font-medium text-[#0c2340]">
                        #{index + 1} {student.full_name || student.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Highest in: {student.highestTestName || '-'} | {student.attempts} attempts
                      </p>
                    </div>
                    <p className="text-sm font-bold text-green-600">
                      {formatScorePercentLabel(student.highestScore)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Attendance rate"
            value={formatScorePercentLabel(attendanceDaySummary.attendanceRate)}
            hint={`${attendanceDaySummary.attendedCount} of ${attendanceDaySummary.totalStudents} students on ${formatDateKeyLabel(attendanceDateKey)} (IST) — click for date-wise report`}
            accent="blue"
            onClick={() => openAttendanceReport()}
          />
          <StatCard
            label="Overall average score"
            value={formatScorePercentLabel(overallAverageScore)}
            hint={`Across ${filteredAttempts.length} attempts in the current filter`}
            accent="navy"
            onClick={() => openCard('overall_average')}
          />
          <StatCard
            label="Pass rate (≥ 40%)"
            value={formatScorePercentLabel(passRate)}
            hint={`${passedCount} of ${filteredAttempts.length} attempts met the pass threshold`}
            accent="emerald"
            onClick={() => openCard('pass_rate')}
          />
          <StatCard
            label="Inactive students"
            value={inactiveStudents}
            hint="Registered but no test attempts yet"
            accent="amber"
            onClick={() => openCard('inactive_students')}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-[#0c2340] mb-4">Score distribution (by student average)</h2>
            <div className="space-y-3">
              {scoreBands.map((band) => {
                const percent =
                  studentsWithAttempts.length > 0
                    ? Math.round((band.count / studentsWithAttempts.length) * 100)
                    : 0;
                return (
                  <div key={band.label}>
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-sm font-medium ${band.tone}`}>{band.label}</p>
                      <p className="text-sm text-slate-700">
                        {band.count} student{band.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#1e3a5f] to-[#3b6ea8]"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-bold text-[#0c2340] mb-4">Recent test submissions</h2>
            {recentAttemptsFeed.length === 0 ? (
              <p className="text-sm text-slate-600">No attempts yet.</p>
            ) : (
              <div className="space-y-3">
                {recentAttemptsFeed.slice(0, 8).map((attempt) => (
                  <div key={attempt.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <p className="text-sm font-medium text-[#0c2340]">{attempt.studentName}</p>
                      <p className="text-xs text-slate-500">
                        {attempt.testName} • {attempt.createdAt ? new Date(attempt.createdAt).toLocaleString() : '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#0c2340]">
                        {formatScorePercentLabel(attempt.score)}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{attempt.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#0c2340]">Test-wise performance overview</h2>
            <p className="text-sm text-slate-500">
              Click a test for student-wise results and PDF/CSV download
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Test</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Attempts</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Avg score</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Highest score</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Pass rate</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Report</th>
                </tr>
              </thead>
              <tbody>
                {testWisePerformance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No test attempts available for current filters.
                    </td>
                  </tr>
                ) : (
                  testWisePerformance.map((row) => (
                    <tr
                      key={row.testId}
                      className="border-b border-slate-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => openTestWiseDetails(row)}
                    >
                      <td className="py-3 px-4 text-[#0c2340] font-medium">{row.testName}</td>
                      <td className="py-3 px-4 text-[#0c2340]">{row.attempts}</td>
                      <td className="py-3 px-4 text-[#0c2340]">{formatScorePercentLabel(row.avgScore)}</td>
                      <td className="py-3 px-4 text-[#0c2340]">{formatScorePercentLabel(row.highestScore)}</td>
                      <td className="py-3 px-4 text-[#0c2340]">{formatScorePercentLabel(row.passRate)}</td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTestWiseDetails(row);
                          }}
                        >
                          View details
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6 mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-[#0c2340]">Student attendance and performance report</h2>
              <p className="text-sm text-slate-500 mt-1">
                Date-wise attendance (IST) · {formatDateKeyLabel(attendanceDateKey)} ·{' '}
                <span className="font-semibold text-emerald-700">
                  {formatScorePercentLabel(attendanceDaySummary.attendanceRate)} present
                </span>{' '}
                ({attendanceDaySummary.attendedCount}/{attendanceDaySummary.totalStudents})
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center shrink-0">
              <Input
                type="date"
                value={attendanceDateKey}
                max={getTodayDateKeyInIST()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setAttendanceDateKey(v);
                }}
                className="w-[11.5rem]"
                aria-label="Attendance date"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAttendanceDateKey(getTodayDateKeyInIST())}
              >
                Today
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#0c2340] hover:bg-[#16304f]"
                onClick={() => openAttendanceReport()}
              >
                View & download report
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Showing {filteredStudents.length} of {allStudents.length} students ·{' '}
            {attendanceDaySummary.attemptsOnDate} attempts on selected date
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Student</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Status (date)</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Attempts on date</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Tests on date</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Lifetime avg</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Lifetime highest</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Report</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No students matched your filters.
                    </td>
                  </tr>
                ) : (
                  attendanceDayRows.map((row) => {
                    const student = filteredStudents.find((s) => s.id === row.studentId);
                    if (!student) return null;
                    return (
                      <tr
                        key={row.studentId}
                        className="border-b border-slate-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => openAttendanceReport()}
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-[#0c2340]">{student.full_name || student.email}</p>
                          <p className="text-xs text-slate-500">{student.email}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                              row.status === 'Attended'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#0c2340]">{row.attemptsOnDate}</td>
                        <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate" title={row.testsOnDate}>
                          {row.testsOnDate}
                        </td>
                        <td className="py-3 px-4 text-[#0c2340]">{formatScorePercentLabel(student.avgScore)}</td>
                        <td className="py-3 px-4 text-[#0c2340]">{formatScorePercentLabel(student.highestScore)}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAttendanceReport();
                            }}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <Link href="/admin/questions">
              <h2 className="text-xl font-bold text-[#0c2340] mb-3">Questions</h2>
              <p className="text-slate-600 mb-4">Manage question bank, add new questions, and import from CSV</p>
              <div className="text-blue-600 font-medium">Manage questions →</div>
            </Link>
          </Card>

          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <Link href="/admin/tests">
              <h2 className="text-xl font-bold text-[#0c2340] mb-3">Tests</h2>
              <p className="text-slate-600 mb-4">View live, upcoming, and ended tests with student attempt stats</p>
              <div className="text-blue-600 font-medium">Manage tests →</div>
            </Link>
          </Card>

          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <Link href="/admin/users">
              <h2 className="text-xl font-bold text-[#0c2340] mb-3">Users</h2>
              <p className="text-slate-600 mb-4">View users and track learning analytics</p>
              <div className="text-blue-600 font-medium">Manage users →</div>
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
