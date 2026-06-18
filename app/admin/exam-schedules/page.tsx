'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { ACADEMIC_YEARS, DEPARTMENTS } from '@/lib/college-brand';
import {
  isScheduleWindowOpen,
  resolveExamScheduleStatus,
  type ExamScheduleDisplayStatus,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { cn } from '@/lib/utils';
import { LoadingScreen } from '@/components/ui/loading-screen';
import {
  formatCollegeDateTime,
  isoToDatetimeLocalInput,
  parseDatetimeLocalAsIst,
} from '@/lib/college-timezone';
import { formatAttemptRoundLabel } from '@/lib/exam-attempt-round';

type ApprovedExam = {
  id: string;
  title: string;
  topic: string | null;
  department: string;
  target_years: string[];
  target_branches: string[];
  duration_minutes: number;
  published_test_id: string;
};

function toLocalInputValue(iso: string | null | undefined): string {
  return isoToDatetimeLocalInput(iso);
}

function fromLocalInputValue(value: string): string | null {
  return parseDatetimeLocalAsIst(value);
}

function statusBadgeTone(
  display: ExamScheduleDisplayStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (display === 'live') return 'success';
  if (display === 'scheduled') return 'warning';
  if (display === 'window_ended') return 'danger';
  return 'neutral';
}

export default function AdminExamSchedulesPage() {
  const [schedules, setSchedules] = useState<ExamScheduleRow[]>([]);
  const [approvedExams, setApprovedExams] = useState<ApprovedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

  const [facultyExamRequestId, setFacultyExamRequestId] = useState('');
  const [title, setTitle] = useState('');
  const [notice, setNotice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/exam-schedules', { credentials: 'include' });
    if (res.ok) {
      const json = (await res.json()) as {
        schedules?: ExamScheduleRow[];
        approvedExams?: ApprovedExam[];
        warnings?: string[];
      };
      setSchedules(json.schedules ?? []);
      setApprovedExams(json.approvedExams ?? []);
      setLoadWarning(json.warnings?.join(' ') ?? null);
      if (!facultyExamRequestId && json.approvedExams?.length) {
        setFacultyExamRequestId(json.approvedExams[0].id);
      }
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadWarning(json.error ?? 'Could not load exam schedules');
    }
    setLoading(false);
  }, [facultyExamRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeScheduleId) return;
    const picked = approvedExams.find((e) => e.id === facultyExamRequestId);
    if (picked) setTitle(picked.title);
  }, [facultyExamRequestId, approvedExams, activeScheduleId]);

  useEffect(() => {
    if (!activeScheduleId) return;
    const selected = schedules.find((s) => s.id === activeScheduleId);
    if (!selected) return;
    setTitle(selected.title);
    setNotice(selected.notice ?? '');
    setStartsAt(toLocalInputValue(selected.starts_at));
    setEndsAt(toLocalInputValue(selected.ends_at));
    if (selected.faculty_exam_request_id) {
      setFacultyExamRequestId(selected.faculty_exam_request_id);
    }
  }, [activeScheduleId, schedules]);

  const activeSchedule = useMemo(
    () => schedules.find((s) => s.id === activeScheduleId) ?? null,
    [schedules, activeScheduleId],
  );

  const activeResolved = activeSchedule
    ? resolveExamScheduleStatus(activeSchedule)
    : null;

  const act = async (id: string, action: 'go_live' | 'end') => {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/exam-schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { error?: string; schedule?: ExamScheduleRow };
      if (!res.ok) {
        alert(json.error ?? 'Action failed');
        return;
      }
      if (action === 'go_live' && json.schedule?.status !== 'live') {
        alert('Go live did not persist. Refresh the page and try again.');
        return;
      }
      await load();
    } finally {
      setActing(null);
    }
  };

  const openNextAttempt = async (schedule: ExamScheduleRow) => {
    if (schedule.slot_number == null) {
      alert('Re-attempt rounds are only available for slot-based schedules.');
      return;
    }
    const confirmed = window.confirm(
      `Open the next attempt round for Slot ${schedule.slot_number}?\n\nPrior attempt scores stay in reports. Students who already submitted this sitting can write again when you go live.`,
    );
    if (!confirmed) return;

    setActing(schedule.id);
    try {
      const res = await fetch(`/api/admin/exam-schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'open_next_attempt', goLiveNow: false }),
      });
      const json = (await res.json()) as { error?: string; message?: string; schedule?: ExamScheduleRow };
      if (!res.ok) {
        alert(json.error ?? 'Could not open next attempt round');
        return;
      }
      alert(json.message ?? 'Next attempt round created. Go live when ready.');
      if (json.schedule?.id) setActiveScheduleId(json.schedule.id);
      await load();
    } finally {
      setActing(null);
    }
  };

  const deleteSchedule = async (schedule: ExamScheduleRow) => {
    if (
      !window.confirm(
        `Delete schedule "${schedule.title}"? Students will no longer see this exam window. The published test stays unless you delete the full exam below.`,
      )
    ) {
      return;
    }
    setActing(schedule.id);
    try {
      const res = await fetch(`/api/admin/exam-schedules/${encodeURIComponent(schedule.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        alert(json.error ?? `Delete failed (${res.status})`);
        return;
      }
      if (activeScheduleId === schedule.id) setActiveScheduleId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActing(null);
    }
  };

  const deleteApprovedExam = async (exam: ApprovedExam) => {
    if (
      !window.confirm(
        `Delete "${exam.title}" completely? This removes the test, all schedules, and student attempts.`,
      )
    ) {
      return;
    }
    setActing(exam.id);
    try {
      const res = await fetch(`/api/admin/exam-requests/${encodeURIComponent(exam.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        alert(json.error ?? `Delete failed (${res.status})`);
        return;
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActing(null);
    }
  };

  const runExamCleanup = async (apply: boolean) => {
    if (apply) {
      const ok = window.confirm(
        'Delete all faculty/admin exams NOT from today (IST)?\n\nElevateX student attempts are kept. This cannot be undone.',
      );
      if (!ok) return;
    }
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const res = await fetch(
        `/api/admin/cleanup-exams-keep-today${apply ? '?apply=1' : ''}`,
        { method: 'POST', credentials: 'include' },
      );
      const json = (await res.json()) as {
        message?: string;
        error?: string;
        keptFacultyRequestIds?: string[];
        deletedFacultyRequestIds?: string[];
      };
      if (!res.ok) {
        setCleanupResult(json.error ?? 'Cleanup failed');
        return;
      }
      setCleanupResult(json.message ?? 'Done');
      if (apply) await load();
    } finally {
      setCleanupLoading(false);
    }
  };

  const clearScheduleForm = () => {
    setActiveScheduleId(null);
    setNotice('');
    setStartsAt('');
    setEndsAt('');
    const picked = approvedExams.find((e) => e.id === facultyExamRequestId);
    setTitle(picked?.title ?? '');
  };

  const saveSchedule = async (): Promise<boolean> => {
    if (!facultyExamRequestId && !activeScheduleId) {
      alert('Select an approved faculty exam');
      return false;
    }
    const startsAtIso = fromLocalInputValue(startsAt);
    if (!startsAtIso) {
      alert('Set a valid start date and time (IST).');
      return false;
    }
    const endsAtIso = endsAt ? fromLocalInputValue(endsAt) : null;
    if (endsAt && !endsAtIso) {
      alert('End time is invalid. Clear it or pick a valid IST datetime.');
      return false;
    }
    if (endsAtIso && new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      alert('End time must be after start time.');
      return false;
    }

    setSavingDraft(true);
    try {
      if (activeScheduleId) {
        const res = await fetch(`/api/admin/exam-schedules/${encodeURIComponent(activeScheduleId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'update',
            title: title.trim() || undefined,
            notice: notice.trim() || undefined,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
          }),
        });
        const json = (await res.json()) as { error?: string; schedule?: ExamScheduleRow };
        if (!res.ok) {
          alert(json.error ?? 'Could not reschedule exam');
          return false;
        }
        await load();
        return true;
      }

      const res = await fetch('/api/admin/exam-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          facultyExamRequestId,
          title: title.trim() || undefined,
          notice: notice.trim() || undefined,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          goLiveNow: false,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        schedule?: ExamScheduleRow;
        message?: string;
        alreadyScheduled?: boolean;
      };
      if (!res.ok) {
        alert(json.error ?? 'Could not save draft');
        return false;
      }
      if (json.alreadyScheduled && json.message) {
        alert(json.message);
      }
      if (json.schedule?.id) {
        setActiveScheduleId(json.schedule.id);
      }
      await load();
      return true;
    } finally {
      setSavingDraft(false);
    }
  };

  const rescheduleAndGoLive = async () => {
    if (!activeScheduleId) {
      alert('Select a schedule from the table first.');
      return;
    }
    const scheduleId = activeScheduleId;
    const saved = await saveSchedule();
    if (!saved) return;
    await act(scheduleId, 'go_live');
  };

  if (loading) {
    return <LoadingScreen message="Loading exam schedules…" className="min-h-[40vh]" />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Live & upcoming exams"
        description="Slot exams go live one at a time (Slot 1, then 2, …). End the current slot before opening the next."
      />

      {loadWarning ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {loadWarning}
        </p>
      ) : null}

      <Card className="p-6">
        <h3 className="font-semibold text-[#0c2340] mb-4">
          {activeScheduleId ? 'Reschedule selected exam' : 'Schedule new exam'}
        </h3>
        {approvedExams.length === 0 ? (
          <p className="text-sm text-slate-600">
            No published exams yet.{' '}
            <Link href="/admin/exam-builder" className="font-semibold text-[#1e3a5f] hover:underline">
              Create an exam in Exam builder →
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Published exam
                </label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={facultyExamRequestId}
                  onChange={(e) => {
                    setFacultyExamRequestId(e.target.value);
                    const picked = approvedExams.find((x) => x.id === e.target.value);
                    if (picked) setTitle(picked.title);
                  }}
                >
                  {approvedExams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} · {e.department}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dashboard title
                </label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Notice (shown on student dashboard)
                </label>
                <Input
                  value={notice}
                  onChange={(e) => setNotice(e.target.value)}
                  placeholder="e.g. Mid-term exam Friday 10 AM — webcam required"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Starts at (IST)
                </label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ends at (IST, optional)
                </label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button disabled={savingDraft} onClick={() => void saveSchedule()}>
                {savingDraft
                  ? 'Saving…'
                  : activeScheduleId
                    ? 'Save reschedule'
                    : 'Save as scheduled'}
              </Button>
              {activeScheduleId ? (
                <Button variant="outline" disabled={savingDraft} onClick={clearScheduleForm}>
                  New schedule
                </Button>
              ) : null}
              {activeScheduleId &&
              activeSchedule &&
              !isScheduleWindowOpen(activeSchedule) ? (
                <>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={acting === activeScheduleId || savingDraft}
                    onClick={() => void act(activeScheduleId, 'go_live')}
                  >
                    {acting === activeScheduleId
                      ? 'Going live…'
                      : activeResolved?.display === 'window_ended' ||
                          activeSchedule?.status === 'ended'
                        ? 'Reopen exam'
                        : 'Go live now'}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-emerald-300 text-emerald-800"
                    disabled={acting === activeScheduleId || savingDraft}
                    onClick={() => void rescheduleAndGoLive()}
                  >
                    Save & reopen
                  </Button>
                </>
              ) : null}
            </div>
            {activeSchedule && activeResolved ? (
              <p className="text-xs text-slate-500">
                Editing: <strong>{activeSchedule.title}</strong> · {activeResolved.label}. Change IST
                times above, click <strong>Save reschedule</strong>, then <strong>Reopen exam</strong> (or{' '}
                <strong>Save & reopen</strong>).
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Save as <strong>scheduled</strong>, then use <strong>Go live</strong>. To reschedule an
                existing row, click <strong>Select</strong> in the table below first.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-[#0c2340] mb-4">All schedules</h3>
        {schedules.length === 0 ? (
          <p className="text-sm text-slate-500">No schedules yet. Create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm app-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Slot / attempt</th>
                  <th>Status</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const resolved = resolveExamScheduleStatus(s);
                  const goLiveAllowed =
                    !isScheduleWindowOpen(s) &&
                    (s.status === 'scheduled' ||
                      s.status === 'ended' ||
                      s.status === 'live' ||
                      resolved.display === 'window_ended');
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        s.id === activeScheduleId && 'bg-blue-50/40',
                      )}
                    >
                      <td className="font-medium">{s.title}</td>
                      <td className="text-slate-600 whitespace-nowrap">
                        {s.slot_number != null
                          ? `Slot ${s.slot_number} · ${formatAttemptRoundLabel(s.attempt_round ?? 1)}`
                          : formatAttemptRoundLabel(s.attempt_round ?? 1)}
                      </td>
                      <td>
                        <Badge tone={statusBadgeTone(resolved.display)}>{resolved.label}</Badge>
                      </td>
                      <td className="text-slate-600 whitespace-nowrap">
                        {formatCollegeDateTime(s.starts_at)}
                      </td>
                      <td className="text-slate-600 whitespace-nowrap">
                        {s.ends_at ? formatCollegeDateTime(s.ends_at) : '—'}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveScheduleId(s.id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            {s.id === activeScheduleId ? 'Editing' : 'Reschedule'}
                          </Button>
                          {goLiveAllowed ? (
                            <Button
                              size="sm"
                              disabled={acting === s.id}
                              onClick={() => void act(s.id, 'go_live')}
                            >
                              {resolved.display === 'window_ended' || s.status === 'ended'
                                ? 'Reopen'
                                : 'Go live'}
                            </Button>
                          ) : null}
                          {resolved.windowOpen || s.status === 'live' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === s.id}
                              onClick={() => void act(s.id, 'end')}
                            >
                              End
                            </Button>
                          ) : null}
                          {s.slot_number != null ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === s.id}
                              onClick={() => void openNextAttempt(s)}
                            >
                              Next attempt
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === s.id}
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => void deleteSchedule(s)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {approvedExams.length > 0 ? (
        <Card className="p-6">
          <h3 className="font-semibold text-[#0c2340] mb-4">Published exams</h3>
          <p className="text-sm text-slate-600 mb-4">
            Delete removes the full exam (test, schedules, and attempts). Use schedule Delete above
            to remove only one time window.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm app-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Years</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvedExams.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium">{e.title}</td>
                    <td>{e.department}</td>
                    <td>{(e.target_years ?? []).join(', ')}</td>
                    <td>{e.duration_minutes} min</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting === e.id}
                        className="text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => void deleteApprovedExam(e)}
                      >
                        Delete exam
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="p-6 border-amber-200 bg-amber-50/40">
        <h3 className="font-semibold text-[#0c2340] mb-2">Clean up old exams</h3>
        <p className="text-sm text-slate-600 mb-4">
          Keeps only exams and schedules from <strong>today (IST)</strong>. Removes older
          requests, schedules, department tests, and related attempts. ElevateX data is not deleted.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={cleanupLoading}
            onClick={() => void runExamCleanup(false)}
          >
            {cleanupLoading ? 'Working…' : 'Preview cleanup'}
          </Button>
          <Button
            variant="destructive"
            disabled={cleanupLoading}
            onClick={() => void runExamCleanup(true)}
          >
            Delete old exams
          </Button>
        </div>
        {cleanupResult ? (
          <p className="text-sm mt-3 text-slate-700 rounded-md bg-white border border-slate-200 px-3 py-2">
            {cleanupResult}
          </p>
        ) : null}
      </Card>

      <p className="text-xs text-slate-500">
        Target scopes: {DEPARTMENTS.slice(0, 3).join(', ')}… · Years: {ACADEMIC_YEARS.join(', ')}
      </p>
    </div>
  );
}
