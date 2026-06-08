'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatScorePercentLabel } from '@/lib/format-score';
import { cn } from '@/lib/utils';
import { ADMIN_EXAM_TYPE_META } from '@/lib/admin/exam-type';
import { downloadTestReportPdf } from '@/lib/admin/export-test-report-pdf';
import { scheduleLabelForTestOverview } from '@/lib/admin/test-overview-report';
import { Button } from '@/components/ui/button';
import { ElevateXLiveResultsPanel } from '@/components/admin/elevatex-live-results-panel';
import { ElevateXScorecardReportModal } from '@/components/admin/elevatex-scorecard-report-modal';
import { useElevateXScorecardModal } from '@/hooks/use-elevatex-scorecard-modal';
import type { TestReportsPayload } from '@/lib/admin/test-reports-data';
import type { AdminTestOverviewItem } from '@/lib/admin/tests-overview-data';

const POLL_MS = 1500;
const AUTO_REPORT_STORAGE_KEY = 'prepindia-auto-slot-reports';

type LiveSchedule = {
  id: string;
  title: string;
  test_id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  slot_number?: number | null;
};

type EndedReportMeta = {
  schedule_id: string;
  slot_number: number | null;
  title: string;
  test_id: string;
  exam_type: keyof typeof ADMIN_EXAM_TYPE_META;
  ends_at: string | null;
};

type LiveBoardEntry = {
  attempt_id: string;
  user_id: string;
  roll_number: string;
  student_name: string;
  score: number;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  rank: number;
};

type LiveBoard = {
  schedule: LiveSchedule;
  test_title: string;
  entries: LiveBoardEntry[];
  submitted_count: number;
  in_progress_count: number;
  highest_score?: number;
  top_scorer?: {
    student_name: string;
    roll_number: string;
    score: number;
  } | null;
};

type LiveWritingEntry = LiveBoardEntry & {
  schedule_id: string;
  schedule_title: string;
  test_title: string;
};

type LiveExamDashboardProps = {
  /** Wait before polling so initial admin stats can use the DB connection first. */
  deferPollMs?: number;
};

function readDownloadedReportIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(AUTO_REPORT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markReportDownloaded(scheduleId: string): void {
  const ids = readDownloadedReportIds();
  ids.add(scheduleId);
  sessionStorage.setItem(AUTO_REPORT_STORAGE_KEY, JSON.stringify([...ids]));
}

async function downloadSlotReport(meta: EndedReportMeta, testTitle: string): Promise<boolean> {
  const q = new URLSearchParams({
    examType: meta.exam_type,
    testId: meta.test_id,
    scheduleId: meta.schedule_id,
  });
  const res = await fetch(`/api/admin/test-reports?${q.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const payload = (await res.json()) as TestReportsPayload;
  if (payload.rows.length === 0) return false;

  const overviewItem: AdminTestOverviewItem = {
    id: `schedule:${meta.schedule_id}`,
    test_id: meta.test_id,
    title: testTitle,
    kind: 'faculty_schedule',
    kind_label: meta.slot_number ? `Slot ${meta.slot_number}` : 'Exam',
    status: 'ended',
    status_label: 'Ended',
    departments: [],
    years: [],
    starts_at: meta.ends_at,
    ends_at: meta.ends_at,
    notice: null,
    description: null,
    duration_minutes: null,
    topic: null,
    slot_number: meta.slot_number,
    faculty_department: null,
    students_attempted: 0,
    completed_attempts: 0,
    total_attempts: 0,
    departments_attempted: [],
    avg_score: null,
  };

  downloadTestReportPdf({
    examLabel: ADMIN_EXAM_TYPE_META[meta.exam_type].label,
    testName: testTitle,
    scheduleLabel: scheduleLabelForTestOverview(overviewItem),
    rows: payload.rows,
    summary: payload.summary,
  });
  return true;
}

function PodiumCard({
  entry,
  place,
}: {
  entry: LiveBoardEntry | undefined;
  place: 1 | 2 | 3;
}) {
  const heights = { 1: 'h-[168px]', 2: 'h-[132px]', 3: 'h-[118px]' } as const;
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' } as const;
  const medalLabels = { 1: 'Gold', 2: 'Silver', 3: 'Bronze' } as const;
  const ringClass = {
    1: 'ring-amber-300/80 shadow-[0_0_42px_rgba(255,215,0,0.45)]',
    2: 'ring-slate-200/70 shadow-[0_0_28px_rgba(226,232,240,0.25)]',
    3: 'ring-amber-600/60 shadow-[0_0_24px_rgba(180,83,9,0.28)]',
  } as const;

  if (!entry) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-end rounded-t-2xl border border-dashed border-white/15 bg-white/5 px-3 pb-4',
          heights[place],
          place === 1 ? 'order-2 sm:scale-105' : place === 2 ? 'order-1' : 'order-3',
        )}
      >
        <span className="text-2xl opacity-40">{medals[place]}</span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/50 mt-1">
          {medalLabels[place]}
        </p>
        <p className="text-xs text-violet-200/50 mt-2">Waiting…</p>
      </div>
    );
  }

  const submitted = entry.submitted_at
    ? new Date(entry.submitted_at).toLocaleTimeString()
    : 'In exam';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-end rounded-t-2xl border border-white/20 bg-gradient-to-b from-white/15 to-white/5 px-3 pb-4 ring-2 backdrop-blur-sm',
        heights[place],
        ringClass[place],
        place === 1 ? 'order-2 sm:scale-105 z-10' : place === 2 ? 'order-1' : 'order-3',
      )}
    >
      {place === 1 ? (
        <div
          className="pointer-events-none absolute -top-8 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-amber-300/25 blur-2xl animate-pulse"
          aria-hidden
        />
      ) : null}
      <span className="text-2xl">{medals[place]}</span>
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90 mt-1">
        {medalLabels[place]}
      </p>
      <p className="mt-2 text-sm font-bold text-white text-center truncate max-w-[120px]">
        {entry.student_name}
      </p>
      <p className="text-[10px] font-mono text-violet-200/80 truncate max-w-[120px]">
        {entry.roll_number || '—'}
      </p>
      <p
        className={cn(
          'mt-2 text-2xl font-black tabular-nums',
          entry.score >= 80 ? 'text-emerald-300' : entry.score >= 40 ? 'text-amber-300' : 'text-rose-300',
        )}
      >
        {formatScorePercentLabel(entry.score)}
      </p>
      <p className="text-[10px] text-violet-200/70 mt-1">{submitted}</p>
    </div>
  );
}

export function LiveExamDashboard({ deferPollMs = 0 }: LiveExamDashboardProps) {
  const [schedules, setSchedules] = useState<LiveSchedule[]>([]);
  const [boards, setBoards] = useState<LiveBoard[]>([]);
  const [endedSchedules, setEndedSchedules] = useState<LiveSchedule[]>([]);
  const [endedBoards, setEndedBoards] = useState<LiveBoard[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [writingNow, setWritingNow] = useState<LiveWritingEntry[]>([]);
  const [live, setLive] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const prevLiveIdsRef = useRef<Set<string>>(new Set());
  const scorecardModal = useElevateXScorecardModal();

  const showingLive = live && schedules.length > 0;
  const activeSchedules = showingLive ? schedules : endedSchedules;
  const activeBoards = showingLive ? boards : endedBoards;

  const board = useMemo(
    () => activeBoards.find((b) => b.schedule.id === selectedId) ?? activeBoards[0] ?? null,
    [activeBoards, selectedId],
  );

  const maybeAutoDownloadEndedSlots = useCallback(
    async (prevLiveIds: Set<string>, ended: EndedReportMeta[], endedBoardList: LiveBoard[]) => {
      const downloaded = readDownloadedReportIds();
      const now = Date.now();
      for (const meta of ended) {
        if (downloaded.has(meta.schedule_id)) continue;
        const wasLive = prevLiveIds.has(meta.schedule_id);
        const endMs = meta.ends_at ? new Date(meta.ends_at).getTime() : 0;
        const endedRecently =
          endMs > 0 && !Number.isNaN(endMs) && now - endMs < 15 * 60 * 1000;
        if (!wasLive && !endedRecently) continue;
        const boardMatch = endedBoardList.find((b) => b.schedule.id === meta.schedule_id);
        const testTitle = boardMatch?.test_title ?? meta.title;
        const ok = await downloadSlotReport(meta, testTitle);
        if (ok) markReportDownloaded(meta.schedule_id);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live-dashboard', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setFetchError('Could not load live dashboard');
        setLive(false);
        return;
      }

      const json = (await res.json()) as {
        live?: boolean;
        schedules?: LiveSchedule[];
        boards?: LiveBoard[];
        ended_schedules?: LiveSchedule[];
        ended_boards?: LiveBoard[];
        ended_reports?: EndedReportMeta[];
        writing_now?: LiveWritingEntry[];
        elevatex_submitted_count?: number;
        elevatex_in_progress_count?: number;
        refreshed_at?: string;
      };

      setFetchError(null);
      const list = json.schedules ?? [];
      const isLive = Boolean(json.live) && list.length > 0;
      const liveBoards = json.boards?.length ? json.boards : [];
      const endedList = json.ended_schedules ?? [];
      const endedBoardList = json.ended_boards ?? [];
      const endedMeta = json.ended_reports ?? [];

      const currentLiveIds = new Set(list.map((s) => s.id));
      const prevLiveIds = prevLiveIdsRef.current;
      void maybeAutoDownloadEndedSlots(prevLiveIds, endedMeta, endedBoardList);
      prevLiveIdsRef.current = currentLiveIds;

      setLive(isLive);
      setSchedules(list);
      setBoards(liveBoards);
      setEndedSchedules(endedList);
      setEndedBoards(endedBoardList);
      setWritingNow(json.writing_now ?? []);
      setRefreshedAt(json.refreshed_at ?? new Date().toISOString());

      const visibleList = isLive ? list : endedList;
      if (visibleList.length === 0) {
        setSelectedId('');
        return;
      }

      setSelectedId((prev) => {
        if (prev && visibleList.some((s) => s.id === prev)) return prev;
        return visibleList[0]?.id ?? '';
      });
    } catch {
      setFetchError('Could not load live dashboard');
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, [maybeAutoDownloadEndedSlots]);

  useEffect(() => {
    let cancelled = false;
    const startDelay = window.setTimeout(() => {
      if (!cancelled) void refresh();
    }, Math.max(0, deferPollMs));

    return () => {
      cancelled = true;
      window.clearTimeout(startDelay);
    };
  }, [refresh, deferPollMs]);

  useEffect(() => {
    if (!live && !loading) return undefined;

    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    let timer: ReturnType<typeof setInterval> | undefined;
    const startTimer = window.setTimeout(() => {
      timer = setInterval(tick, POLL_MS);
    }, Math.max(0, deferPollMs));

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(startTimer);
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, deferPollMs, live, loading]);

  if (loading) {
    return (
      <section className="mb-8 rounded-2xl border border-violet-300/30 bg-gradient-to-br from-[#1a0a3e] via-[#2d1b69] to-[#0d2847] p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-200/90">
          Live command centre
        </p>
        <p className="mt-3 text-violet-100/80 animate-pulse">Checking for live examinations…</p>
      </section>
    );
  }

  if (fetchError) {
    return (
      <section className="mb-8 rounded-2xl border border-red-300/40 bg-red-950/40 p-4 text-sm text-red-100">
        {fetchError}
      </section>
    );
  }

  if (!showingLive) {
    return (
      <section className="mb-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Live command centre
        </p>
        <p className="mt-2 text-slate-600">
          No examinations are live right now. Open <strong>Tests</strong> or{' '}
          <strong>Exam schedules</strong> to go live, then students will appear here while writing.
        </p>
      </section>
    );
  }

  const entries = board?.entries ?? [];
  const multiLive = showingLive && schedules.length > 1;
  const multiEnded = !showingLive && endedSchedules.length > 1;
  const submittedEntries = entries
    .filter((e) => e.submitted_at)
    .sort((a, b) => b.score - a.score || a.rank - b.rank);
  const liveLeaders = entries
    .filter((e) => !e.submitted_at)
    .sort((a, b) => b.score - a.score || a.rank - b.rank);
  const podiumSource = submittedEntries.length > 0 ? submittedEntries : liveLeaders;
  const podium = {
    first: podiumSource[0],
    second: podiumSource[1],
    third: podiumSource[2],
  };
  const highestScore =
    board?.highest_score ?? (entries.length ? Math.max(...entries.map((e) => e.score)) : 0);
  const topScorer = board?.top_scorer ?? podiumSource[0] ?? null;
  const podiumLabel =
    submittedEntries.length > 0
      ? 'Top performers this session · Gold · Silver · Bronze'
      : 'Live leaders · partial scores · Gold · Silver · Bronze';

  const openFullReport = (entry: LiveBoardEntry) => {
    if (!entry.submitted_at || entry.attempt_id.startsWith('session-')) return;
    void scorecardModal.open({
      attemptId: entry.attempt_id,
      studentName: entry.student_name,
      rollNumber: entry.roll_number || undefined,
    });
  };

  const sessionStartsAt = board?.schedule.starts_at ?? schedules[0]?.starts_at ?? null;

  return (
    <>
    <section className="mb-8 overflow-hidden rounded-2xl border border-violet-400/25 shadow-[0_24px_64px_-16px_rgba(26,10,62,0.65)]">
      <div className="relative bg-gradient-to-br from-[#1a0a3e] via-[#2d1b69] to-[#0d2847] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,215,0,0.18), transparent 60%), radial-gradient(circle at 20% 80%, rgba(139,92,246,0.2), transparent 40%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.15), transparent 35%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
          aria-hidden
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                {showingLive ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-red-400/60 bg-red-500/25 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-red-100 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-300/40 bg-slate-500/25 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-100">
                    Ended
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-200/95">
                  {showingLive ? 'Live leaderboard' : 'Final slot report'}
                </span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold mt-3 text-white tracking-tight truncate">
                {multiLive
                  ? `${schedules.length} exams live now`
                  : board?.test_title ?? 'Exam session'}
              </h2>
              <p className="text-sm text-violet-200/80 mt-1">
                {showingLive
                  ? `This live session only · auto-refresh every ${POLL_MS / 1000}s`
                  : 'Slot ended · top performers ranked · report downloaded automatically'}
                {multiLive ? ' · tap a test below when multiple are live' : ''}
              </p>
            </div>
            {showingLive ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-center shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-amber-100/80">Students writing</p>
                <p className="text-3xl font-black text-amber-200 tabular-nums">{writingNow.length}</p>
              </div>
            ) : null}
          </div>

          {multiLive || multiEnded ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
              {activeBoards.map((b) => {
                const active = b.schedule.id === selectedId;
                return (
                  <button
                    key={b.schedule.id}
                    type="button"
                    onClick={() => setSelectedId(b.schedule.id)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition',
                      active
                        ? 'border-amber-300/70 bg-amber-400/20 ring-2 ring-amber-300/50'
                        : 'border-white/20 bg-white/5 hover:bg-white/10',
                    )}
                  >
                    <p className="text-sm font-semibold text-white truncate">{b.test_title}</p>
                    <p className="text-[10px] text-violet-200/70 mt-0.5 truncate">
                      {b.schedule.slot_number ? `Slot ${b.schedule.slot_number} · ` : ''}
                      {b.schedule.title}
                    </p>
                    <div className="mt-3 flex gap-4 text-[10px] uppercase tracking-wider">
                      {showingLive ? (
                        <>
                          <span className="text-cyan-200">
                            <span className="font-bold text-lg tabular-nums">{b.in_progress_count}</span>{' '}
                            writing
                          </span>
                          <span className="text-emerald-200">
                            <span className="font-bold text-lg tabular-nums">{b.submitted_count}</span>{' '}
                            done
                          </span>
                        </>
                      ) : (
                        <span className="text-emerald-200">
                          <span className="font-bold text-lg tabular-nums">{b.submitted_count}</span>{' '}
                          submitted
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {board ? (
            <>
              <p className="text-sm font-medium text-amber-100/90 mb-4 truncate">
                {board.schedule.slot_number ? `Slot ${board.schedule.slot_number} · ` : ''}
                Now showing: {board.test_title}
                {board.schedule.ends_at
                  ? ` · ${showingLive ? 'ends' : 'ended'} ${new Date(board.schedule.ends_at).toLocaleString()}`
                  : ''}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 max-w-3xl">
                <div className="rounded-xl border border-violet-300/30 bg-violet-500/15 px-3 py-3 text-center">
                  <p className="text-2xl font-black text-violet-100 tabular-nums">{entries.length}</p>
                  <p className="text-[10px] uppercase tracking-wider text-violet-200/70">On board</p>
                </div>
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-3 text-center">
                  <p className="text-2xl font-black text-amber-200 tabular-nums">
                    {formatScorePercentLabel(highestScore)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-amber-100/70">Highest score</p>
                  {topScorer ? (
                    <p className="text-[10px] text-amber-100/80 font-mono mt-1 truncate">
                      {topScorer.roll_number || topScorer.student_name}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-3 text-center">
                  <p className="text-2xl font-black text-emerald-200 tabular-nums">
                    {board.submitted_count}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100/70">Submitted</p>
                </div>
                <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-3 text-center">
                  <p className="text-2xl font-black text-cyan-200 tabular-nums">
                    {board.in_progress_count}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-cyan-100/70">In progress</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200/90 mb-3 text-center">
                  {podiumLabel}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-xl mx-auto items-end">
                  <PodiumCard entry={podium.second} place={2} />
                  <PodiumCard entry={podium.first} place={1} />
                  <PodiumCard entry={podium.third} place={3} />
                </div>
              </div>

              {showingLive && writingNow.length > 0 ? (
                <div className="mb-6 rounded-2xl border border-cyan-400/35 bg-cyan-500/10 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200/95 mb-3">
                    Currently writing ({writingNow.length})
                  </p>
                  <ul className="space-y-2 max-h-[180px] overflow-y-auto">
                    {writingNow.map((row) => (
                      <li
                        key={`${row.schedule_id}-${row.attempt_id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{row.student_name}</p>
                          <p className="text-xs text-cyan-100/80 font-mono">{row.roll_number}</p>
                        </div>
                        <p className="text-xs font-bold text-amber-200/95 tabular-nums">
                          {formatScorePercentLabel(row.score)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/15 bg-black/25 overflow-hidden backdrop-blur-sm">
                <div className="hidden sm:grid sm:grid-cols-[3rem_1fr_7rem_5rem_6rem_8rem] gap-2 px-4 py-3 bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-transparent text-xs font-bold uppercase tracking-wider text-amber-100/95 border-b border-white/10">
                  <span>#</span>
                  <span>Student</span>
                  <span>Roll</span>
                  <span className="text-right">Score</span>
                  <span className="text-right">Status</span>
                  <span className="text-right">Time</span>
                </div>
                {entries.length === 0 ? (
                  <p className="px-4 py-12 text-center text-violet-200/70 text-sm">
                    {showingLive ? 'Waiting for the first submission…' : 'No attempts recorded for this slot.'}
                  </p>
                ) : (
                  <ul className="max-h-[min(380px,45vh)] overflow-y-auto divide-y divide-white/5">
                    {entries.map((entry, idx) => {
                      const isTop = idx < 3;
                      const submitted = entry.submitted_at
                        ? new Date(entry.submitted_at).toLocaleTimeString()
                        : showingLive
                          ? 'In exam'
                          : '—';
                      const canReport =
                        Boolean(entry.submitted_at) &&
                        !entry.attempt_id.startsWith('session-');
                      return (
                        <li
                          key={entry.attempt_id}
                          className={cn(
                            'px-4 py-3 transition-colors',
                            isTop && 'bg-amber-400/8',
                            !entry.submitted_at && showingLive && 'bg-cyan-500/8',
                            canReport && 'cursor-pointer hover:bg-white/5',
                          )}
                          onClick={() => canReport && openFullReport(entry)}
                        >
                          <div className="sm:grid sm:grid-cols-[3rem_1fr_7rem_5rem_6rem_8rem] sm:gap-2 sm:items-center">
                            <span
                              className={cn(
                                'text-lg font-black tabular-nums',
                                idx === 0 && 'text-amber-300',
                                idx === 1 && 'text-slate-200',
                                idx === 2 && 'text-amber-600/90',
                                idx > 2 && 'text-violet-200/80',
                              )}
                            >
                              #{entry.rank}
                            </span>
                            <div className="mt-1 sm:mt-0 min-w-0">
                              <p className="font-semibold text-white truncate">{entry.student_name}</p>
                              <p className="text-xs text-violet-200/70 font-mono sm:hidden">
                                {entry.roll_number || '—'}
                              </p>
                            </div>
                            <span className="hidden sm:block text-sm text-violet-100/90 font-mono truncate">
                              {entry.roll_number || '—'}
                            </span>
                            <span
                              className={cn(
                                'text-xl font-black tabular-nums block mt-1 sm:mt-0 sm:text-right',
                                entry.score >= 80
                                  ? 'text-emerald-300'
                                  : entry.score >= 40
                                    ? 'text-amber-300'
                                    : 'text-rose-300',
                              )}
                            >
                              {formatScorePercentLabel(entry.score)}
                            </span>
                            <span className="text-xs text-violet-200/80 block sm:text-right mt-0.5 sm:mt-0">
                              {entry.submitted_at ? (
                                canReport ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openFullReport(entry);
                                    }}
                                  >
                                    Full report
                                  </Button>
                                ) : (
                                  'Submitted'
                                )
                              ) : (
                                'In exam'
                              )}
                            </span>
                            <span className="text-xs text-violet-200/70 tabular-nums block sm:text-right mt-0.5 sm:mt-0">
                              {submitted}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : null}

          {refreshedAt ? (
            <p className="text-[10px] text-violet-300/55 mt-4 text-right tabular-nums">
              Last update {new Date(refreshedAt).toLocaleTimeString()}
            </p>
          ) : null}
        </div>
      </div>
    </section>

    <ElevateXLiveResultsPanel
      className="mb-8"
      sessionStartsAt={sessionStartsAt}
    />

    <ElevateXScorecardReportModal
      open={scorecardModal.isOpen}
      onClose={scorecardModal.close}
      studentName={scorecardModal.target?.studentName ?? ''}
      rollNumber={scorecardModal.target?.rollNumber}
      scorecard={scorecardModal.scorecard}
      loading={scorecardModal.loading}
      loadError={scorecardModal.loadError}
    />
    </>
  );
}
