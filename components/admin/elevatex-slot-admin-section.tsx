'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  ExamSlotSchedulePanel,
  emptySlots,
} from '@/components/exam-builder/exam-slot-schedule-panel';
import { ElevateXLiveInfo } from '@/components/elevatex/elevatex-live-info';
import { ElevateXTechnicalFormatPanel } from '@/components/admin/elevatex-technical-format-panel';
import { ACADEMIC_YEARS } from '@/lib/college-brand';
import { ELEVATEX_EXAM_NAME, ELEVATEX_MODULE_KEY } from '@/lib/elevatex';
import type { ElevateXAdminState } from '@/lib/elevatex-admin';
import {
  validateElevateXPublishSlots,
  validateOptionalConfiguredSlots,
  validateSingleScheduleSlot,
  type ExamScheduleSlotInput,
} from '@/lib/exam-schedule-slots';
import { cn } from '@/lib/utils';

export function ElevateXSlotAdminSection() {
  const [state, setState] = useState<ElevateXAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<ExamScheduleSlotInput[]>(emptySlots);
  const [title, setTitle] = useState(ELEVATEX_EXAM_NAME);
  const [notice, setNotice] = useState('');
  const [targetYears, setTargetYears] = useState<string[]>([...ACADEMIC_YEARS]);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveSlotNumber, setSaveSlotNumber] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/elevatex');
    if (res.ok) {
      const json = (await res.json()) as ElevateXAdminState;
      setState(json);
      if (json.scheduleSlots.length) setSlots(json.scheduleSlots);
      if (json.title) setTitle(json.title);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const published = Boolean(state?.published);
  const canPublish =
    !published &&
    validateElevateXPublishSlots(slots) === null &&
    validateOptionalConfiguredSlots(slots) === null;

  const publishError =
    validateElevateXPublishSlots(slots) ?? validateOptionalConfiguredSlots(slots);

  const toggleYear = (year: string) =>
    setTargetYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    );

  const reprovisionLogins = async () => {
    if (!state?.requestId) return;
    setActing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/elevatex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'provision_logins', requestId: state.requestId }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not create logins');
      setSuccess(json.message ?? 'Student logins updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create logins');
    } finally {
      setActing(false);
    }
  };

  const publish = async () => {
    setError(null);
    setSuccess(null);
    if (!canPublish) {
      setError(publishError ?? 'Complete Slot 1 before publishing.');
      return;
    }
    setActing(true);
    try {
      const res = await fetch('/api/admin/elevatex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          title,
          notice: notice.trim() || undefined,
          targetYears,
          scheduleSlots: slots,
          openSlot1Now: true,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Publish failed');
      setSuccess(json.message ?? 'ElevateX published.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setActing(false);
    }
  };

  const saveSlot = async (slotNumber: number, goLiveNow: boolean) => {
    const slot = slots.find((s) => s.slot_number === slotNumber);
    if (!slot || !state?.requestId) return;
    const slotErr = validateSingleScheduleSlot(slot);
    if (slotErr) {
      setError(slotErr);
      return;
    }
    setSaveSlotNumber(slotNumber);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/elevatex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_slot',
          requestId: state.requestId,
          slotNumber,
          scheduleSlots: slots,
          goLiveNow,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setSuccess(json.message ?? `Slot ${slotNumber} saved.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaveSlotNumber(null);
    }
  };

  const goLiveSchedule = async (scheduleId: string) => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/elevatex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'go_live', scheduleId }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Go live failed');
      setSuccess(json.message ?? 'Slot is live.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Go live failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading ElevateX slot configuration…</p>;
  }

  return (
    <Card className="p-6 space-y-5 border-fuchsia-200/60 bg-gradient-to-b from-fuchsia-50/40 to-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#0c2340] flex items-center gap-2">
            ElevateX · 8-slot scheduling
            {published ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}
          </h3>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Upload slot-wise student rosters. Publish when Slot 1 is ready — it goes live immediately.
            Students sign in with <strong>roll number</strong> (not email) and the password from your CSV or
            the default (<code className="text-xs">Exam2026</code>). Download the credentials CSV after import.
          </p>
        </div>
        <ElevateXLiveInfo compact />
      </div>

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Exam title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1"
            disabled={published}
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notice (shown on /placement)
          </label>
          <Input
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            placeholder="e.g. Slot 1 — report to Lab A by 9:00 AM"
            className="mt-1"
          />
        </div>
      </div>

      <ElevateXTechnicalFormatPanel
        requestId={state?.requestId ?? null}
        initialFormats={state?.technicalFormats ?? {}}
      />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Target years
        </p>
        <div className="flex flex-wrap gap-2">
          {ACADEMIC_YEARS.map((y) => {
            const active = targetYears.includes(y);
            return (
              <button
                key={y}
                type="button"
                onClick={() => toggleYear(y)}
                disabled={published}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition',
                  active
                    ? 'bg-fuchsia-700 text-white border-fuchsia-700'
                    : 'bg-white text-slate-600 border-slate-200',
                  published && 'opacity-60 cursor-not-allowed',
                )}
              >
                {y}
              </button>
            );
          })}
        </div>
      </div>

      <ExamSlotSchedulePanel
        enabled
        onEnabledChange={() => {}}
        slots={slots}
        onSlotsChange={setSlots}
        lockEnabled
        slotPublishHint="Only Slot 1 is required to publish. Slots 2–8 can stay empty until you schedule them."
      />

      {published && state?.slots.length ? (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="py-2 px-3">Slot</th>
                <th className="py-2 px-3">Students</th>
                <th className="py-2 px-3">Schedule</th>
                <th className="py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.slots.map((row) => (
                <tr key={row.slot_number} className="border-b border-slate-100">
                  <td className="py-2 px-3 font-medium">Slot {row.slot_number}</td>
                  <td className="py-2 px-3">{row.roster_count || '—'}</td>
                  <td className="py-2 px-3">
                    {row.schedule_status ? (
                      <Badge
                        tone={
                          row.schedule_status === 'live'
                            ? 'success'
                            : row.schedule_status === 'scheduled'
                              ? 'warning'
                              : 'neutral'
                        }
                        className="capitalize"
                      >
                        {row.schedule_status}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">Not scheduled</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {row.slot_number > 1 || published ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saveSlotNumber === row.slot_number || acting}
                          onClick={() => void saveSlot(row.slot_number, false)}
                        >
                          {saveSlotNumber === row.slot_number ? 'Saving…' : 'Save slot'}
                        </Button>
                      ) : null}
                      {row.schedule_id && row.schedule_status !== 'live' ? (
                        <Button
                          size="sm"
                          disabled={acting}
                          onClick={() => void goLiveSchedule(row.schedule_id!)}
                        >
                          Go live
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {!published ? (
          <Button
            disabled={acting || !canPublish}
            onClick={() => void publish()}
            className="bg-fuchsia-700 hover:bg-fuchsia-800"
          >
            {acting ? 'Publishing…' : 'Publish ElevateX & open Slot 1'}
          </Button>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              ElevateX is published. Save additional slots above, then go live one at a time (Slot 1 →
              2 → …).
            </p>
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => void reprovisionLogins()}
            >
              {acting ? 'Working…' : 'Reset student logins from roster'}
            </Button>
          </>
        )}
        <Link href="/admin/exam-schedules">
          <Button variant="outline">Exam schedules →</Button>
        </Link>
        <Link href="/placement">
          <Button variant="ghost">Student /placement →</Button>
        </Link>
      </div>

      {!published && publishError ? (
        <p className="text-sm text-amber-800">{publishError}</p>
      ) : null}

      <p className="text-xs text-slate-500">
        Module key <code className="font-mono">{ELEVATEX_MODULE_KEY}</code> · Students take the exam at{' '}
        <Link href="/placement/assessment" className="underline">
          /placement/assessment
        </Link>{' '}
        during their assigned slot window.
      </p>
    </Card>
  );
}
