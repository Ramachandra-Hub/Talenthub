'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, TestAttempt } from '@/lib/types';
import type { DbServiceClient } from '@/lib/db/get-db-service';
import { adaptQuestionRow, answersMatchMcq, extractJoinedQuestion } from '@/lib/practice-mappers';
import { formatScorePercent, formatScorePercentLabel, roundScorePercent } from '@/lib/format-score';
import { formatDbError } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ElevateXScorecardView } from '@/components/placement/elevatex-scorecard-view';
import { downloadElevateXScorecardPdf } from '@/lib/placement/elevatex-scorecard-pdf';
import type { PlacementScorecard } from '@/lib/placement/types';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { downloadFilteredUsersExcel } from '@/lib/admin/export-admin-lists-xlsx';
import { studentMatchesAutoSubmitFilter } from '@/lib/admin/student-auto-submit-filter';

type AttemptRow = TestAttempt & {
  test?: {
    id?: string | number;
    title?: string;
    name?: string;
  } | null;
};

type AttemptQuestionRow = {
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
};

type AttemptReport = {
  id: string;
  testName: string;
  score: number;
  status: string;
  date: string;
  timeTakenSec: number;
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
  questions: AttemptQuestionRow[];
  isElevateX?: boolean;
  elevatexScorecard?: PlacementScorecard | null;
  hasElevateXScorecard?: boolean;
};

type StudentReport = {
  student: User;
  totalAttempts: number;
  completedAttempts: number;
  avgScore: number;
  bestScore: number;
  attempts: AttemptReport[];
};

type PortalSessionStatus = {
  active: boolean;
  last_heartbeat: string | null;
  locked_at: string | null;
};

type AdminStudentRow = User & {
  roll_number?: string | null;
  branch?: string | null;
  academic_year?: string | null;
  portal_session?: PortalSessionStatus;
  attempt_count?: number;
  completed_count?: number;
  best_score?: number;
  avg_score?: number;
  auto_submit_count?: number;
  zero_score_auto_submit_count?: number;
  has_auto_submit?: boolean;
  logged_in_with_auto_submit?: boolean;
  last_auto_submit_at?: string | null;
};

function matchesScoreFilter(
  user: AdminStudentRow,
  scoreInput: string,
  mode: 'min' | 'exact',
  options?: { autoSubmitFilterActive?: boolean },
): boolean {
  const raw = scoreInput.trim();
  if (!raw) return true;
  const target = Number(raw);
  if (!Number.isFinite(target)) return true;

  const best = roundScorePercent(user.best_score ?? 0);
  const avg = roundScorePercent(user.avg_score ?? 0);
  const hasAttempts = (user.attempt_count ?? 0) > 0;
  const targetRounded = roundScorePercent(target);

  if (options?.autoSubmitFilterActive && user.has_auto_submit) {
    if (targetRounded <= 0.01) {
      return (
        (user.zero_score_auto_submit_count ?? 0) > 0 ||
        best <= 0.01 ||
        avg <= 0.01 ||
        !hasAttempts
      );
    }
    return true;
  }

  if (!hasAttempts && best <= 0 && avg <= 0) {
    if (targetRounded <= 0.01 && user.has_auto_submit) return true;
    return false;
  }

  if (mode === 'exact') {
    return Math.abs(best - targetRounded) <= 0.5 || Math.abs(avg - targetRounded) <= 0.5;
  }
  return best >= targetRounded - 0.001;
}

function resolveUserRoll(user: AdminStudentRow): string {
  const direct = user.roll_number?.trim();
  if (direct) return direct.toUpperCase().replace(/\s+/g, '');
  const local = user.email.split('@')[0]?.trim();
  return (local ?? '').toUpperCase().replace(/\s+/g, '');
}

function userInSlotRoster(
  user: AdminStudentRow,
  slotUserIds: Set<string>,
  slotRosterRolls: Set<string>,
): boolean {
  if (slotUserIds.has(user.id)) return true;
  const roll = resolveUserRoll(user);
  return Boolean(roll && slotRosterRolls.has(roll));
}

export default function UsersManagementPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('');
  const [scoreFilterMode, setScoreFilterMode] = useState<'min' | 'exact'>('min');
  const [autoSubmitFilter, setAutoSubmitFilter] = useState<'all' | 'auto_only'>('all');
  const [slotFilter, setSlotFilter] = useState('all');
  const [slotSchedules, setSlotSchedules] = useState<
    Array<{
      id: string;
      label: string;
      slot_number: number | null;
      roster_count: number;
    }>
  >([]);
  const [slotUserIds, setSlotUserIds] = useState<Set<string>>(new Set());
  const [slotRosterRolls, setSlotRosterRolls] = useState<Set<string>>(new Set());
  const [slotRosterMeta, setSlotRosterMeta] = useState<{
    label: string;
    roster_count: number;
    matched_count: number;
  } | null>(null);
  const [slotRosterLoading, setSlotRosterLoading] = useState(false);
  const [reportLoadingUserId, setReportLoadingUserId] = useState<string | null>(null);
  const [releaseLoadingUserId, setReleaseLoadingUserId] = useState<string | null>(null);
  const [deleteLoadingUserId, setDeleteLoadingUserId] = useState<string | null>(null);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [selectedReport, setSelectedReport] = useState<StudentReport | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [fetchedScorecard, setFetchedScorecard] = useState<PlacementScorecard | null>(null);
  const [rdsEnvMissing, setDbEnvMissing] = useState(false);

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users', { credentials: 'include' });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      console.error('Admin users API:', json.error ?? res.status);
      return;
    }
    const json = (await res.json()) as { students?: AdminStudentRow[]; users?: AdminStudentRow[] };
    const rows = json.students ?? json.users ?? [];
    setUsers(
      rows.map((u) => ({
        ...u,
        branch: (u as AdminStudentRow & { branch?: string | null }).branch ?? null,
        academic_year: (u as AdminStudentRow & { academic_year?: string }).academic_year ?? null,
        roll_number: u.roll_number ?? null,
        portal_session: u.portal_session ?? { active: false, last_heartbeat: null, locked_at: null },
        attempt_count: u.attempt_count ?? 0,
        completed_count: u.completed_count ?? 0,
        best_score: u.best_score ?? 0,
        avg_score: u.avg_score ?? 0,
        auto_submit_count: u.auto_submit_count ?? 0,
        zero_score_auto_submit_count: u.zero_score_auto_submit_count ?? 0,
        has_auto_submit: u.has_auto_submit ?? false,
        logged_in_with_auto_submit: u.logged_in_with_auto_submit ?? false,
        last_auto_submit_at: u.last_auto_submit_at ?? null,
      })) as AdminStudentRow[],
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const meRes = await fetch('/api/admin/me', { credentials: 'include' });
        if (!meRes.ok) {
          router.push('/auth/login/admin');
          return;
        }
        setIsAdmin(true);
        await loadUsers();
      } catch (error) {
        console.error('Error:', formatDbError(error), error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    void fetch('/api/admin/users/slot-roster', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as {
          schedules?: Array<{
            id: string;
            label: string;
            slot_number: number | null;
            attempt_round?: number;
            roster_count: number;
          }>;
        };
        setSlotSchedules(json.schedules ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (slotFilter === 'all') {
      setSlotUserIds(new Set());
      setSlotRosterRolls(new Set());
      setSlotRosterMeta(null);
      return;
    }

    let cancelled = false;
    setSlotRosterLoading(true);
    void fetch(`/api/admin/users/slot-roster?scheduleId=${encodeURIComponent(slotFilter)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          schedule_title?: string;
          slot_number?: number | null;
          attempt_round?: number;
          roster_count?: number;
          matched_user_ids?: string[];
          roster_rolls?: string[];
        };
      })
      .then((json) => {
        if (cancelled || !json) return;
        const label =
          json.slot_number != null
            ? `${json.schedule_title ?? 'Exam'} · Slot ${json.slot_number} · Attempt ${json.attempt_round ?? 1}`
            : (json.schedule_title ?? 'Exam schedule');
        setSlotUserIds(new Set(json.matched_user_ids ?? []));
        setSlotRosterRolls(new Set(json.roster_rolls ?? []));
        setSlotRosterMeta({
          label,
          roster_count: json.roster_count ?? 0,
          matched_count: json.matched_user_ids?.length ?? 0,
        });
      })
      .finally(() => {
        if (!cancelled) setSlotRosterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slotFilter]);

  const handleForceLogout = async (student: AdminStudentRow) => {
    const label =
      student.roll_number?.trim() ||
      student.full_name?.trim() ||
      student.email;
    const confirmed = window.confirm(
      `Release portal login for ${label}?\n\nThis clears the "roll number already logged in" lock so the student can sign in again and continue their exam.`,
    );
    if (!confirmed) return;

    setReleaseLoadingUserId(student.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(student.id)}/release-session`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to release portal session');
      }
      alert(json.message ?? 'Portal session released.');
      await loadUsers();
    } catch (error) {
      alert(`Force logout failed: ${formatDbError(error)}`);
    } finally {
      setReleaseLoadingUserId(null);
    }
  };

  const handleDeleteStudent = async (student: AdminStudentRow) => {
    const label =
      student.roll_number?.trim() ||
      student.full_name?.trim() ||
      student.email;
    const yearNote = student.academic_year ? ` (${student.academic_year})` : '';
    const confirmed = window.confirm(
      `Permanently delete ${label}${yearNote}?\n\nThis removes the student account, login, exam attempts, and related data. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleteLoadingUserId(student.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(student.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to delete student');
      }
      alert(json.message ?? 'Student deleted.');
      if (selectedReport?.student.id === student.id) {
        setSelectedReport(null);
      }
      await loadUsers();
    } catch (error) {
      alert(`Delete failed: ${formatDbError(error)}`);
    } finally {
      setDeleteLoadingUserId(null);
    }
  };

  const handleBulkDeleteFiltered = async () => {
    if (filteredUsers.length === 0) return;

    const slotLabel = slotRosterMeta ? ` from ${slotRosterMeta.label}` : '';
    const yearLabel = yearFilter !== 'all' ? ` in ${yearFilter}` : '';
    const confirmed = window.confirm(
      `Permanently delete ${filteredUsers.length} student${filteredUsers.length === 1 ? '' : 's'}${slotLabel}${yearLabel}?\n\nThis removes their accounts, logins, and exam attempts so they can register again and re-attempt. This cannot be undone.`,
    );
    if (!confirmed) return;

    const typed = window.prompt(
      `Type DELETE to confirm removal of ${filteredUsers.length} student${filteredUsers.length === 1 ? '' : 's'}.`,
    );
    if (typed?.trim().toUpperCase() !== 'DELETE') return;

    setBulkDeleteBusy(true);
    try {
      const body =
        slotFilter !== 'all'
          ? { scheduleId: slotFilter }
          : { userIds: filteredUsers.map((u) => u.id) };
      const res = await fetch('/api/admin/users/bulk-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        deleted?: number;
        failed?: number;
      };
      if (!res.ok) {
        throw new Error(json.error ?? 'Bulk delete failed');
      }
      alert(json.message ?? `Deleted ${json.deleted ?? 0} students.`);
      setSelectedReport(null);
      setSlotFilter('all');
      await loadUsers();
    } catch (error) {
      alert(`Bulk delete failed: ${formatDbError(error)}`);
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const academicYears = useMemo(() => {
    const years = new Set<string>();
    for (const user of users) {
      const year = user.academic_year?.trim();
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }, [users]);

  const filteredUsers = users.filter((user) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      user.email.toLowerCase().includes(q) ||
      (user.full_name?.toLowerCase().includes(q) ?? false) ||
      (user.roll_number?.toLowerCase().includes(q) ?? false);
    if (!matchesSearch) return false;

    if (yearFilter !== 'all') {
      const year = user.academic_year?.trim() ?? '';
      if (year !== yearFilter) return false;
    }

    if (slotFilter !== 'all' && !userInSlotRoster(user, slotUserIds, slotRosterRolls)) return false;

    if (autoSubmitFilter === 'auto_only' && !studentMatchesAutoSubmitFilter(user)) return false;

    return matchesScoreFilter(user, scoreFilter, scoreFilterMode, {
      autoSubmitFilterActive: autoSubmitFilter === 'auto_only',
    });
  });

  const scoreFilterActive = scoreFilter.trim().length > 0;
  const slotFilterActive = slotFilter !== 'all';
  const autoSubmitFilterActive = autoSubmitFilter === 'auto_only';
  const autoSubmitTotal = users.filter((u) => studentMatchesAutoSubmitFilter(u)).length;

  const activePortalSessions = users.filter((u) => u.portal_session?.active).length;

  const exportFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (autoSubmitFilterActive) parts.push('auto-submit');
    if (slotFilterActive && slotRosterMeta) parts.push(slotRosterMeta.label);
    if (yearFilter !== 'all') parts.push(`year-${yearFilter}`);
    if (scoreFilterActive) parts.push(`score-${scoreFilter.trim()}`);
    return parts.join('-') || 'filtered';
  }, [autoSubmitFilterActive, slotFilterActive, slotRosterMeta, yearFilter, scoreFilterActive, scoreFilter]);

  const handleDownloadFilteredExcel = () => {
    if (!filteredUsers.length) return;
    downloadFilteredUsersExcel(
      filteredUsers.map((u) => ({
        full_name: u.full_name ?? null,
        roll_number: u.roll_number ?? null,
        branch: u.branch ?? null,
        academic_year: u.academic_year ?? null,
        email: u.email,
        auto_submit_count: u.auto_submit_count,
        has_auto_submit: u.has_auto_submit,
        zero_score_auto_submit_count: u.zero_score_auto_submit_count,
        logged_in_with_auto_submit: u.logged_in_with_auto_submit,
        last_auto_submit_at: u.last_auto_submit_at,
        best_score: u.best_score,
        avg_score: u.avg_score,
        attempt_count: u.attempt_count,
      })),
      exportFilterLabel,
    );
  };

  const getAttemptQuestions = async (
    db: DbServiceClient,
    attempt: AttemptRow
  ) => {
    const testId = String(attempt.test_id ?? '');

    const { data: linked, error: linkedErr } = await db
      .from('test_questions')
      .select('question:questions(*)')
      .eq('test_id', testId)
      .order('order', { ascending: true });

    let normalized = (linked ?? [])
      .map(extractJoinedQuestion)
      .filter((q): q is Record<string, unknown> => q != null)
      .map(adaptQuestionRow);

    if (linkedErr || normalized.length === 0) {
      const { data: direct, error: directErr } = await db
        .from('questions')
        .select('*')
        .eq('test_id', testId)
        .order('id', { ascending: true });
      if (!directErr && direct?.length) {
        normalized = direct.map((q) => adaptQuestionRow(q as Record<string, unknown>));
      }
    }

    return normalized;
  };

  const buildStudentReport = async (student: User): Promise<StudentReport> => {
    const res = await fetch(`/api/admin/users/${student.id}/attempts`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? 'Failed to load student attempts');
    }
    const json = (await res.json()) as {
      totalAttempts: number;
      completedAttempts: number;
      avgScore: number;
      bestScore: number;
      attempts: AttemptReport[];
    };

    return {
      student,
      totalAttempts: json.totalAttempts,
      completedAttempts: json.completedAttempts,
      avgScore: json.avgScore,
      bestScore: json.bestScore,
      attempts: json.attempts ?? [],
    };
  };

  const handleOpenReport = async (student: User) => {
    setReportLoadingUserId(student.id);
    try {
      const report = await buildStudentReport(student);
      setFetchedScorecard(null);
      setSelectedReport(report);
      const elevatexFirst = report.attempts.find((a) => a.isElevateX);
      setSelectedAttemptId(elevatexFirst?.id ?? report.attempts[0]?.id ?? null);
    } catch (error) {
      alert(`Failed to build report: ${formatDbError(error)}`);
    } finally {
      setReportLoadingUserId(null);
    }
  };

  const downloadExcelCsv = (report: StudentReport) => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];

    lines.push('Student Summary');
    lines.push(`Name,${escape(report.student.full_name || '-')}`);
    lines.push(`Email,${escape(report.student.email)}`);
    lines.push(`Phone,${escape(report.student.phone || '-')}`);
    lines.push(`Joined,${escape(new Date(report.student.created_at).toLocaleDateString())}`);
    lines.push(`Total Attempts,${report.totalAttempts}`);
    lines.push(`Completed Attempts,${report.completedAttempts}`);
    lines.push(`Average Score,${formatScorePercentLabel(report.avgScore)}`);
    lines.push(`Best Score,${formatScorePercentLabel(report.bestScore)}`);
    lines.push('');

    lines.push('Attempts');
    lines.push('Attempt ID,Test Name,Score %,Status,Date,Time Taken (min),Answered,Correct,Total Questions');
    for (const attempt of report.attempts) {
      lines.push(
        [
          escape(attempt.id),
          escape(attempt.testName),
          attempt.score,
          escape(attempt.status),
          escape(new Date(attempt.date).toLocaleString()),
          Math.round(attempt.timeTakenSec / 60),
          attempt.answeredCount,
          attempt.correctCount,
          attempt.totalQuestions,
        ].join(',')
      );
    }
    lines.push('');

    lines.push('Question Level Details');
    lines.push('Attempt ID,Test Name,Question,Student Answer,Correct Answer,Is Correct');
    for (const attempt of report.attempts) {
      for (const q of attempt.questions) {
        lines.push(
          [
            escape(attempt.id),
            escape(attempt.testName),
            escape(q.questionText),
            escape(q.userAnswer || 'Not answered'),
            escape(q.correctAnswer),
            q.isCorrect ? 'Yes' : 'No',
          ].join(',')
        );
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-report-${report.student.email.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = (report: StudentReport) => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Student Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Name: ${report.student.full_name || '-'}`, 14, 24);
    doc.text(`Email: ${report.student.email}`, 14, 30);
    doc.text(`Phone: ${report.student.phone || '-'}`, 14, 36);
    doc.text(
      `Attempts: ${report.totalAttempts} | Avg: ${formatScorePercentLabel(report.avgScore)} | Best: ${formatScorePercentLabel(report.bestScore)}`,
      14,
      42
    );

    autoTable(doc, {
      startY: 48,
      head: [['Attempt ID', 'Test', 'Score', 'Status', 'Date', 'Answered/Correct']],
      body: report.attempts.map((a) => [
        a.id,
        a.testName,
        formatScorePercentLabel(a.score),
        a.status,
        new Date(a.date).toLocaleDateString(),
        `${a.answeredCount}/${a.correctCount}`,
      ]),
      styles: { fontSize: 8 },
    });

    for (const attempt of report.attempts) {
      doc.addPage();
      doc.setFontSize(12);
      doc.text(`Attempt: ${attempt.testName}`, 14, 16);
      doc.setFontSize(10);
      doc.text(
        `Score ${formatScorePercentLabel(attempt.score)} | ${attempt.correctCount}/${attempt.totalQuestions} correct`,
        14,
        22
      );
      autoTable(doc, {
        startY: 28,
        head: [['Question', 'Student Answer', 'Correct Answer', 'Correct?']],
        body: attempt.questions.map((q) => [
          q.questionText,
          q.userAnswer || 'Not answered',
          q.correctAnswer,
          q.isCorrect ? 'Yes' : 'No',
        ]),
        styles: { fontSize: 8, cellWidth: 'wrap' },
        columnStyles: { 0: { cellWidth: 90 } },
      });
    }

    doc.save(`student-report-${report.student.email.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  const selectedAttempt =
    selectedReport?.attempts.find((a) => a.id === selectedAttemptId) ?? null;

  const elevatexScorecard =
    fetchedScorecard ?? selectedAttempt?.elevatexScorecard ?? null;

  useEffect(() => {
    if (!selectedAttempt?.isElevateX || !selectedAttemptId) {
      setFetchedScorecard(null);
      return;
    }
    if (selectedAttempt.elevatexScorecard) {
      setFetchedScorecard(null);
      return;
    }

    let cancelled = false;
    setScorecardLoading(true);
    void fetch(`/api/admin/elevatex/scorecard/${encodeURIComponent(selectedAttemptId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = (await res.json()) as { scorecard?: PlacementScorecard };
        return json.scorecard ?? null;
      })
      .then((card) => {
        if (!cancelled) setFetchedScorecard(card);
      })
      .finally(() => {
        if (!cancelled) setScorecardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAttemptId, selectedAttempt?.isElevateX, selectedAttempt?.elevatexScorecard]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (rdsEnvMissing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <p className="text-gray-600 text-center max-w-lg">{'Configure AUTH_SECRET and DATABASE_URL'}</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <AdminPageHeader
        title="Users"
        description="Filter by slot + attempt round, score, or auto-submitted exams. Open the next attempt round on Exam Schedules instead of deleting students to allow re-attempts."
      />
      <div>
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <p className="text-gray-600 text-sm font-medium mb-2">Total Users</p>
            <p className="text-4xl font-bold text-blue-600">{users.length}</p>
          </Card>
          <Card className="p-6">
            <p className="text-gray-600 text-sm font-medium mb-2">Portal Logged In</p>
            <p className="text-4xl font-bold text-[#1e3a5f]">{activePortalSessions}</p>
          </Card>
          <Card className="p-6">
            <p className="text-gray-600 text-sm font-medium mb-2">Registered This Month</p>
            <p className="text-4xl font-bold text-green-600">
              {users.filter((u) => {
                const d = new Date(u.created_at);
                const n = new Date();
                return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
              }).length}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-gray-600 text-sm font-medium mb-2">Auto-submitted</p>
            <p className="text-4xl font-bold text-red-600">{autoSubmitTotal}</p>
          </Card>
        </div>

        {/* Filters */}
        <div className="mb-4 grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_11rem_12rem] lg:items-end">
          <Input
            placeholder="Search roll, email, or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-w-0"
          />
          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Score (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              placeholder="e.g. 60"
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="w-full min-w-0"
            />
          </div>
          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Score match</label>
            <select
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              value={scoreFilterMode}
              onChange={(e) => setScoreFilterMode(e.target.value as 'min' | 'exact')}
            >
              <option value="min">At least</option>
              <option value="exact">Exact best</option>
            </select>
          </div>
          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Academic year</label>
            <select
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="all">All years</option>
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Auto-submit</label>
            <select
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              value={autoSubmitFilter}
              onChange={(e) => setAutoSubmitFilter(e.target.value as 'all' | 'auto_only')}
            >
              <option value="all">All students</option>
              <option value="auto_only">Auto-submitted only</option>
            </select>
          </div>
        </div>

        <div className="mb-6 grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Exam schedule slot (from Exam Schedules)
            </label>
            <select
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value)}
              disabled={slotRosterLoading}
            >
              <option value="all">All students (no slot filter)</option>
              {slotSchedules.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                  {slot.roster_count > 0 ? ` · ${slot.roster_count} rostered` : ''}
                </option>
              ))}
            </select>
            {slotFilterActive && slotRosterMeta ? (
              <p className="text-xs text-gray-600 mt-1.5">
                {slotRosterLoading
                  ? 'Loading slot roster…'
                  : `${slotRosterMeta.matched_count} registered account${slotRosterMeta.matched_count === 1 ? '' : 's'} matched of ${slotRosterMeta.roster_count} on roster. Delete removes accounts and attempts so students can sign in again.`}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto shrink-0 justify-end">
            {filteredUsers.length > 0 ? (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleDownloadFilteredExcel}
              >
                Download Excel ({filteredUsers.length})
              </Button>
            ) : null}
            {isAdmin && filteredUsers.length > 0 ? (
              <Button
                variant="outline"
                className="w-full sm:w-auto border-red-300 text-red-700 hover:bg-red-50"
                disabled={bulkDeleteBusy || Boolean(deleteLoadingUserId) || slotRosterLoading}
                onClick={() => void handleBulkDeleteFiltered()}
              >
                {bulkDeleteBusy
                  ? 'Deleting…'
                  : slotFilterActive
                    ? `Delete slot (${filteredUsers.length})`
                    : `Delete (${filteredUsers.length})`}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Mobile list — no horizontal scroll */}
        <div className="md:hidden space-y-3">
          {filteredUsers.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">No users found</Card>
          ) : (
            filteredUsers.map((user) => (
              <Card key={user.id} className="p-4 overflow-hidden">
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {user.roll_number || 'No roll'} · {user.full_name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {user.academic_year || 'Year —'} · Joined{' '}
                      {new Date(user.created_at).toLocaleDateString()}
                      {user.phone ? ` · ${user.phone}` : ''}
                    </p>
                    {(scoreFilterActive || (user.attempt_count ?? 0) > 0) && (
                      <p className="text-xs text-gray-700 mt-1.5">
                        Best:{' '}
                        <span className="font-semibold text-[#1e3a5f]">
                          {(user.attempt_count ?? 0) > 0
                            ? formatScorePercentLabel(user.best_score)
                            : '—'}
                        </span>
                        {' · '}
                        Avg:{' '}
                        {(user.attempt_count ?? 0) > 0
                          ? formatScorePercentLabel(user.avg_score)
                          : '—'}
                        {' · '}
                        Attempts: {user.attempt_count ?? 0}
                      </p>
                    )}
                    {user.has_auto_submit ? (
                      <p className="text-xs text-red-700 mt-1 font-medium">
                        Auto-submitted: {user.auto_submit_count ?? 1}
                        {(user.zero_score_auto_submit_count ?? 0) > 0
                          ? ` · ${user.zero_score_auto_submit_count} at 0%`
                          : ''}
                        {user.logged_in_with_auto_submit ? ' · logged in' : ''}
                        {user.last_auto_submit_at
                          ? ` · ${new Date(user.last_auto_submit_at).toLocaleDateString()}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                  {user.has_auto_submit ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                      Auto-submit
                    </span>
                  ) : null}
                  {user.portal_session?.active ? (
                    <span
                      className="shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800"
                      title={
                        user.portal_session.last_heartbeat
                          ? `Last active ${new Date(user.portal_session.last_heartbeat).toLocaleString()}`
                          : undefined
                      }
                    >
                      Online
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                      Offline
                    </span>
                  )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleOpenReport(user)}
                    disabled={reportLoadingUserId === user.id}
                  >
                    {reportLoadingUserId === user.id ? '…' : 'Report'}
                  </Button>
                  {isAdmin && user.portal_session?.active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-red-200 text-red-700"
                      onClick={() => handleForceLogout(user)}
                      disabled={releaseLoadingUserId === user.id || Boolean(bulkDeleteBusy)}
                    >
                      {releaseLoadingUserId === user.id ? '…' : 'Logout'}
                    </Button>
                  ) : null}
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-red-300 text-red-800"
                      onClick={() => void handleDeleteStudent(user)}
                      disabled={
                        deleteLoadingUserId === user.id ||
                        Boolean(bulkDeleteBusy) ||
                        releaseLoadingUserId === user.id
                      }
                    >
                      {deleteLoadingUserId === user.id ? '…' : 'Delete'}
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Desktop table — fits screen width */}
        <Card className="hidden md:block overflow-hidden">
          <table className="admin-table">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[26%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[28%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Roll</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Student</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Year</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Best</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Avg</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Session</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-sm text-gray-900 font-medium">
                      {user.roll_number || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-sm min-w-0">
                      <p className="font-medium text-gray-900 truncate">{user.full_name || '—'}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      <p className="text-xs text-gray-400 truncate lg:hidden">
                        {user.phone || 'No phone'}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-600">{user.academic_year || '—'}</td>
                    <td className="py-2.5 px-3 text-sm font-medium text-[#1e3a5f]">
                      {(user.attempt_count ?? 0) > 0
                        ? formatScorePercentLabel(user.best_score)
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-700">
                      {(user.attempt_count ?? 0) > 0
                        ? formatScorePercentLabel(user.avg_score)
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-sm">
                      <div className="flex flex-col gap-1">
                      {user.portal_session?.active ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                          title={
                            user.portal_session.last_heartbeat
                              ? `Last active ${new Date(user.portal_session.last_heartbeat).toLocaleString()}`
                              : undefined
                          }
                        >
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Offline
                        </span>
                      )}
                      {user.has_auto_submit ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                          title={
                            user.last_auto_submit_at
                              ? `Last auto-submit ${new Date(user.last_auto_submit_at).toLocaleString()}`
                              : undefined
                          }
                        >
                          Auto-submit ({user.auto_submit_count ?? 1}
                          {(user.zero_score_auto_submit_count ?? 0) > 0 ? ', 0%' : ''})
                        </span>
                      ) : null}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-sm">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => handleOpenReport(user)}
                          disabled={reportLoadingUserId === user.id}
                        >
                          {reportLoadingUserId === user.id ? '…' : 'Report'}
                        </Button>
                        {isAdmin && user.portal_session?.active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => handleForceLogout(user)}
                            disabled={releaseLoadingUserId === user.id || Boolean(bulkDeleteBusy)}
                          >
                            {releaseLoadingUserId === user.id ? '…' : 'Logout'}
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs border-red-300 text-red-800 hover:bg-red-50"
                            onClick={() => void handleDeleteStudent(user)}
                            disabled={
                              deleteLoadingUserId === user.id ||
                              Boolean(bulkDeleteBusy) ||
                              releaseLoadingUserId === user.id
                            }
                          >
                            {deleteLoadingUserId === user.id ? '…' : 'Delete'}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <p className="text-sm text-gray-600 mt-4">
          Showing {filteredUsers.length} of {users.length} users
          {slotFilterActive && slotRosterMeta ? ` · ${slotRosterMeta.label}` : ''}
          {yearFilter !== 'all' ? ` · year: ${yearFilter}` : ''}
          {scoreFilterActive
            ? ` · score ${scoreFilterMode === 'exact' ? '=' : '≥'} ${scoreFilter.trim()}% (best)`
            : ''}
          {autoSubmitFilterActive ? ' · auto-submitted only' : ''}
        </p>
      </div>

      {selectedReport && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-report-title"
        >
          <button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
            aria-label="Close student report"
            onClick={() => setSelectedReport(null)}
          />
          <div className="flex min-h-full items-start sm:items-center justify-center p-3 sm:p-6">
          <div className="relative z-[1] my-auto flex w-full max-w-6xl max-h-[min(calc(100dvh-1.5rem),920px)] flex-col rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-4 sm:px-6 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2
                    id="student-report-title"
                    className="text-xl sm:text-2xl font-bold text-gray-900 break-words"
                  >
                    Student report: {selectedReport.student.full_name || selectedReport.student.email}
                </h2>
                  <p className="text-sm text-gray-600 mt-1 break-all">{selectedReport.student.email}</p>
              </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => downloadExcelCsv(selectedReport)}>
                    Export CSV
                </Button>
                  <Button
                    size="sm"
                    onClick={() => downloadPdf(selectedReport)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                  Download PDF
                </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedReport(null)}>
                  Close
                </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 min-h-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <Card className="p-4">
                  <p className="text-sm text-gray-600">Total attempts</p>
                  <p className="text-2xl font-bold text-blue-600">{selectedReport.totalAttempts}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{selectedReport.completedAttempts}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-gray-600">Average score</p>
                  <p className="text-2xl font-bold text-[#1e3a5f]">
                    {formatScorePercentLabel(selectedReport.avgScore)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-gray-600">Best score</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {formatScorePercentLabel(selectedReport.bestScore)}
                  </p>
                </Card>
            </div>

            <Card className="p-4 mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select attempted test</label>
              <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                value={selectedAttemptId ?? ''}
                onChange={(e) => setSelectedAttemptId(e.target.value)}
              >
                {selectedReport.attempts.map((a) => (
                  <option key={a.id} value={a.id}>
                      {a.testName} — {new Date(a.date).toLocaleString()} — {formatScorePercentLabel(a.score)}
                  </option>
                ))}
              </select>
            </Card>

            {selectedAttempt ? (
                selectedAttempt.isElevateX ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-gray-600">
                        ElevateX full scorecard — section breakdown, readiness, and recommendations.
                      </p>
                      {elevatexScorecard ? (
                        <Button
                          size="sm"
                          className="bg-[#1e3a5f] hover:bg-[#16304f]"
                          onClick={() =>
                            downloadElevateXScorecardPdf(
                              elevatexScorecard,
                              `elevatex-${selectedReport.student.email.replace(/[^a-zA-Z0-9]/g, '_')}-${selectedAttempt.id}.pdf`,
                            )
                          }
                        >
                          Download scorecard (PDF)
                        </Button>
                      ) : null}
                    </div>
                    {scorecardLoading ? (
                      <Card className="p-8 text-center text-gray-600">Loading ElevateX scorecard…</Card>
                    ) : elevatexScorecard ? (
                      <ElevateXScorecardView scorecard={elevatexScorecard} compact />
                    ) : (
                      <Card className="p-6 text-center text-amber-900 bg-amber-50 border-amber-200">
                        <p className="font-medium">ElevateX scorecard not stored for this attempt</p>
                        <p className="text-sm mt-2 text-amber-800/90">
                          The student completed ElevateX before scorecard storage was enabled, or only a
                          summary score was saved. New submissions include the full scorecard in View Report.
                        </p>
                        <p className="text-sm mt-3 text-gray-700">
                          Overall score: {formatScorePercentLabel(selectedAttempt.score)}
                        </p>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card className="p-4 sm:p-5 overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mb-4 text-sm">
                      <p className="min-w-0">
                        <strong>Test:</strong>{' '}
                        <span className="text-gray-800">{selectedAttempt.testName}</span>
                      </p>
                      <p>
                        <strong>Status:</strong> {selectedAttempt.status}
                      </p>
                      <p>
                        <strong>Score:</strong> {formatScorePercentLabel(selectedAttempt.score)}
                      </p>
                      <p>
                        <strong>Answered:</strong> {selectedAttempt.answeredCount}/
                        {selectedAttempt.totalQuestions}
                      </p>
                      <p>
                        <strong>Correct:</strong> {selectedAttempt.correctCount}/
                        {selectedAttempt.totalQuestions}
                      </p>
                </div>
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <table className="admin-table text-sm">
                        <colgroup>
                          <col className="w-[42%]" />
                          <col className="w-[22%]" />
                          <col className="w-[22%]" />
                          <col className="w-[14%]" />
                        </colgroup>
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-3 font-semibold text-gray-700">Question</th>
                            <th className="text-left py-3 px-3 font-semibold text-gray-700">Student answer</th>
                            <th className="text-left py-3 px-3 font-semibold text-gray-700">Correct answer</th>
                            <th className="text-left py-3 px-3 font-semibold text-gray-700">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAttempt.questions.map((q, idx) => (
                            <tr key={idx} className="border-b border-gray-100 align-top">
                              <td className="py-3 px-3 text-gray-900 break-words whitespace-pre-wrap">
                                {q.questionText}
                              </td>
                              <td className="py-3 px-3 text-gray-700 break-words">
                                {q.userAnswer || 'Not answered'}
                              </td>
                              <td className="py-3 px-3 text-gray-700 break-words">{q.correctAnswer}</td>
                              <td
                                className={`py-3 px-3 font-medium whitespace-nowrap ${
                                  q.isCorrect ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                            {q.isCorrect ? 'Correct' : 'Incorrect'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
                )
            ) : (
              <Card className="p-6 text-center text-gray-600">No attempts found for this student.</Card>
            )}
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
