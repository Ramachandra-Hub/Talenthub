'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusAlert } from '@/components/ui/status-alert';
import { RosterSheetImportDialog } from '@/components/exam-builder/roster-sheet-import-dialog';
import {
  DEFAULT_EXAM_STUDENT_PASSWORD,
  downloadRosterCredentialsCsv,
  enrichSlotsWithPasswords,
} from '@/lib/roster-credentials-export';
import {
  EXAM_SLOT_CAPACITY_DEFAULT,
  EXAM_SLOT_COUNT,
  type ExamScheduleSlotInput,
  parseRosterCsv,
} from '@/lib/exam-schedule-slots';

function emptySlots(): ExamScheduleSlotInput[] {
  return Array.from({ length: EXAM_SLOT_COUNT }, (_, i) => ({
    slot_number: i + 1,
    exam_date: '',
    start_time: '09:00',
    end_time: '11:00',
    capacity: EXAM_SLOT_CAPACITY_DEFAULT,
    roster: [],
  }));
}

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  slots: ExamScheduleSlotInput[];
  onSlotsChange: (slots: ExamScheduleSlotInput[]) => void;
  /** When true, slot scheduling cannot be turned off (ElevateX). */
  lockEnabled?: boolean;
  /** Slots that cannot be edited (pending or approved). */
  lockedSlotNumbers?: number[];
  /** Extra copy for ElevateX (Slot 1 only required). */
  slotPublishHint?: string;
};

function slotStatusShort(status: ExamScheduleSlotInput['approval_status']): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return '';
  }
}

export function ExamSlotSchedulePanel({
  enabled,
  onEnabledChange,
  slots,
  onSlotsChange,
  lockEnabled = false,
  lockedSlotNumbers = [],
  slotPublishHint,
}: Props) {
  const lockedSet = useMemo(() => new Set(lockedSlotNumbers), [lockedSlotNumbers]);
  const [activeSlot, setActiveSlot] = useState(1);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [sheetImportOpen, setSheetImportOpen] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState(DEFAULT_EXAM_STUDENT_PASSWORD);

  const slotsWithPasswords = useMemo(
    () => enrichSlotsWithPasswords(slots, defaultPassword),
    [slots, defaultPassword],
  );

  const totalStudents = useMemo(
    () => slotsWithPasswords.reduce((sum, slot) => sum + slot.roster.length, 0),
    [slotsWithPasswords],
  );

  const current = useMemo(
    () => slots.find((s) => s.slot_number === activeSlot) ?? slots[0],
    [slots, activeSlot],
  );

  const updateSlot = (slotNumber: number, patch: Partial<ExamScheduleSlotInput>) => {
    if (lockedSet.has(slotNumber)) return;
    onSlotsChange(
      slots.map((s) => (s.slot_number === slotNumber ? { ...s, ...patch } : s)),
    );
  };

  const clearSlotRoster = (slotNumber: number) => {
    const slot = slots.find((s) => s.slot_number === slotNumber);
    if (!slot?.roster.length) return;
    if (
      !window.confirm(
        `Remove all ${slot.roster.length} student(s) from Slot ${slotNumber}? You can re-upload the file after clearing.`,
      )
    ) {
      return;
    }
    updateSlot(slotNumber, { roster: [] });
    setImportNote(`Slot ${slotNumber} roster cleared. Import Excel/CSV again to add students.`);
  };

  const clearAllSlotRosters = () => {
    if (totalStudents === 0) return;
    if (
      !window.confirm(
        `Remove all ${totalStudents} student(s) from every slot? Slot dates and times will be kept.`,
      )
    ) {
      return;
    }
    onSlotsChange(slots.map((slot) => ({ ...slot, roster: [] })));
    setImportNote('All slot rosters cleared. Re-import your Excel/CSV file.');
  };

  const handleCsvImport = (slotNumber: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const roster = parseRosterCsv(text);
      if (roster.length === 0) {
        setImportNote('No roll numbers found. Use roll,name,email,department,year or roll,email,password,department,year.');
        return;
      }
      if (roster.length > EXAM_SLOT_CAPACITY_DEFAULT) {
        setImportNote(
          `Imported ${roster.length} rows — maximum ${EXAM_SLOT_CAPACITY_DEFAULT} per slot. Only the first ${EXAM_SLOT_CAPACITY_DEFAULT} were kept.`,
        );
        updateSlot(slotNumber, {
          roster: enrichSlotsWithPasswords(
            [{ slot_number: slotNumber, exam_date: '', start_time: '09:00', end_time: '11:00', roster: roster.slice(0, EXAM_SLOT_CAPACITY_DEFAULT) }],
            defaultPassword,
          )[0]!.roster,
        });
        return;
      }
      setImportNote(`Slot ${slotNumber}: imported ${roster.length} student(s).`);
      updateSlot(slotNumber, {
        roster: enrichSlotsWithPasswords(
          [{ slot_number: slotNumber, exam_date: '', start_time: '09:00', end_time: '11:00', roster }],
          defaultPassword,
        )[0]!.roster,
      });
    };
    reader.readAsText(file);
  };

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[#0c2340]">Date & slot scheduling (optional)</p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Enable to run the exam across {EXAM_SLOT_COUNT} separate dates/slots with up to{' '}
            {EXAM_SLOT_CAPACITY_DEFAULT} students per slot. Students outside a slot see the test as
            locked.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onEnabledChange(true)}>
          Enable 8-slot scheduling
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1e3a5f]/20 bg-gradient-to-b from-slate-50 to-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0c2340]">8 slots · {EXAM_SLOT_CAPACITY_DEFAULT} students each</p>
          <p className="text-xs text-slate-600 mt-1">
            Set exam date and timings per slot in <strong>IST (Indian Standard Time)</strong>. Import an Excel/CSV roster,
            map columns, then assign students to slots (max {EXAM_SLOT_CAPACITY_DEFAULT} per slot).
          </p>
          {slotPublishHint ? (
            <p className="text-xs text-emerald-800 mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5">
              {slotPublishHint}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setSheetImportOpen(true)}>
            Import Excel / CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={totalStudents === 0}
            className="text-red-700 border-red-200 hover:bg-red-50"
            onClick={clearAllSlotRosters}
          >
            Clear all rosters
          </Button>
          {lockEnabled ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={() => onEnabledChange(false)}>
              Disable slots
            </Button>
          )}
        </div>
      </div>

      {importNote ? <StatusAlert variant="info">{importNote}</StatusAlert> : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-800">Student login passwords</p>
          <p className="text-[11px] text-slate-600 mt-1">
            Set a default password for students without one in the sheet. Download the credentials CSV and share with students.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block text-xs font-medium text-slate-600 min-w-[180px]">
            Default password
            <Input
              className="mt-1 h-9"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
              placeholder={DEFAULT_EXAM_STUDENT_PASSWORD}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!current?.roster.length}
            onClick={() => {
              const ok = downloadRosterCredentialsCsv(
                slotsWithPasswords.filter((slot) => slot.slot_number === activeSlot),
                `slot-${activeSlot}-credentials.csv`,
                defaultPassword,
              );
              if (!ok) setImportNote('No students in this slot to export.');
            }}
          >
            Download Slot {activeSlot} credentials
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={totalStudents === 0}
            onClick={() => {
              const ok = downloadRosterCredentialsCsv(
                slotsWithPasswords,
                'all-slots-credentials.csv',
                defaultPassword,
              );
              if (!ok) setImportNote('Upload roster students before downloading credentials.');
            }}
          >
            Download all slots ({totalStudents})
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => {
          const filled = s.exam_date && s.roster.length > 0;
          return (
            <button
              key={s.slot_number}
              type="button"
              onClick={() => setActiveSlot(s.slot_number)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                activeSlot === s.slot_number
                  ? 'bg-[#0c2340] text-white border-[#0c2340]'
                  : filled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              Slot {s.slot_number}
              <span className="ml-1 opacity-80">({s.roster.length})</span>
            </button>
          );
        })}
      </div>

      {current && lockedSet.has(current.slot_number) ? (
        <StatusAlert variant="info">
          Slot {current.slot_number} is {current.approval_status === 'approved' ? 'approved' : 'awaiting admin approval'} and cannot be edited.
        </StatusAlert>
      ) : null}

      {current ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block text-xs font-medium text-slate-600">
            Exam date
            <Input
              type="date"
              className="mt-1 h-9"
              value={current.exam_date}
              disabled={lockedSet.has(current.slot_number)}
              onChange={(e) => updateSlot(current.slot_number, { exam_date: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Start time (IST)
            <Input
              type="time"
              className="mt-1 h-9"
              value={current.start_time}
              disabled={lockedSet.has(current.slot_number)}
              onChange={(e) => updateSlot(current.slot_number, { start_time: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            End time (IST)
            <Input
              type="time"
              className="mt-1 h-9"
              value={current.end_time}
              disabled={lockedSet.has(current.slot_number)}
              onChange={(e) => updateSlot(current.slot_number, { end_time: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Capacity (max {EXAM_SLOT_CAPACITY_DEFAULT})
            <Input
              type="number"
              min={1}
              max={EXAM_SLOT_CAPACITY_DEFAULT}
              className="mt-1 h-9"
              disabled={lockedSet.has(current.slot_number)}
              value={current.capacity ?? EXAM_SLOT_CAPACITY_DEFAULT}
              onChange={(e) =>
                updateSlot(current.slot_number, {
                  capacity: Math.min(
                    EXAM_SLOT_CAPACITY_DEFAULT,
                    Math.max(1, Number(e.target.value) || EXAM_SLOT_CAPACITY_DEFAULT),
                  ),
                })
              }
            />
          </label>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Slot {activeSlot} roster — {current?.roster.length ?? 0} / {current?.capacity ?? EXAM_SLOT_CAPACITY_DEFAULT}{' '}
            students
          </p>
          {current && current.roster.length > 0 && !lockedSet.has(activeSlot) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => clearSlotRoster(activeSlot)}
            >
              Remove students
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label
            className={`inline-flex items-center gap-2 text-xs font-medium text-[#1e3a5f] ${
              lockedSet.has(activeSlot) ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
            }`}
          >
            <input
              type="file"
              accept=".csv,.txt"
              className="text-xs"
              disabled={lockedSet.has(activeSlot)}
              onChange={(e) => handleCsvImport(activeSlot, e.target.files?.[0] ?? null)}
            />
            Upload CSV
          </label>
          <span className="text-[10px] text-slate-500">
            Quick CSV for this slot only, or use Import Excel / CSV above for column mapping.
          </span>
        </div>
        {current && current.roster.length > 0 ? (
          <div className="max-h-32 overflow-auto text-[11px] font-mono text-slate-600 border border-slate-100 rounded p-2 bg-slate-50">
            {current.roster.slice(0, 8).map((r) => (
              <div key={r.roll_number}>
                {r.roll_number}
                {r.student_name ? ` · ${r.student_name}` : ''}
                {r.branch ? ` · ${r.branch}` : ''}
                {r.academic_year ? ` · Y${r.academic_year}` : ''}
                {r.password ? ` · pwd: ${r.password}` : ''}
              </div>
            ))}
            {current.roster.length > 8 ? (
              <p className="text-slate-400 mt-1">+ {current.roster.length - 8} more…</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-amber-700">No students uploaded for this slot yet.</p>
        )}
      </div>

      <RosterSheetImportDialog
        open={sheetImportOpen}
        onOpenChange={setSheetImportOpen}
        slots={slots}
        defaultPassword={defaultPassword}
        onImport={(nextSlots, message) => {
          onSlotsChange(enrichSlotsWithPasswords(nextSlots, defaultPassword));
          setImportNote(message);
        }}
      />
    </div>
  );
}

export { emptySlots };
