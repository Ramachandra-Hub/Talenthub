'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  EXAM_SLOT_CAPACITY_DEFAULT,
  EXAM_SLOT_COUNT,
  type ExamScheduleSlotInput,
} from '@/lib/exam-schedule-slots';
import {
  DEFAULT_EXAM_STUDENT_PASSWORD,
  downloadRosterCredentialsCsv,
  enrichSlotsWithPasswords,
} from '@/lib/roster-credentials-export';
import {
  ROSTER_COLUMN_FIELDS,
  type ParsedRosterSheet,
  type RosterColumnKey,
  type RosterColumnMapping,
  buildSlotRosterImport,
  guessRosterColumnMapping,
  parseSpreadsheetFile,
  previewMappedRosterRows,
} from '@/lib/roster-sheet-import';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: ExamScheduleSlotInput[];
  defaultPassword: string;
  onImport: (nextSlots: ExamScheduleSlotInput[], message: string) => void;
};

const NONE_VALUE = '__none__';

export function RosterSheetImportDialog({
  open,
  onOpenChange,
  slots,
  defaultPassword,
  onImport,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sheet, setSheet] = useState<ParsedRosterSheet | null>(null);
  const [mapping, setMapping] = useState<RosterColumnMapping>({});
  const [assignmentMode, setAssignmentMode] = useState<'single_slot' | 'slot_column'>('single_slot');
  const [targetSlot, setTargetSlot] = useState('1');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [downloadAfterImport, setDownloadAfterImport] = useState(true);
  const [importDefaultPassword, setImportDefaultPassword] = useState(defaultPassword);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewRows = useMemo(() => {
    if (!sheet || !mapping.roll_number) return [];
    return previewMappedRosterRows(sheet, mapping, 5);
  }, [sheet, mapping]);

  const reset = () => {
    setStep(1);
    setSheet(null);
    setMapping({});
    setAssignmentMode('single_slot');
    setTargetSlot('1');
    setReplaceExisting(true);
    setDownloadAfterImport(true);
    setImportDefaultPassword(defaultPassword);
    setError(null);
    setLoading(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (!parsed.headers.length || !parsed.rows.length) {
        throw new Error('The sheet is empty or has no data rows.');
      }
      setSheet(parsed);
      setMapping(guessRosterColumnMapping(parsed.headers));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read spreadsheet.');
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (key: RosterColumnKey, header: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (header === NONE_VALUE) {
        delete next[key];
      } else {
        next[key] = header;
      }
      return next;
    });
  };

  const canContinueFromMapping = Boolean(mapping.roll_number);

  const handleImport = () => {
    if (!sheet) return;
    setError(null);
    try {
      const useSlotColumn = assignmentMode === 'slot_column' && Boolean(mapping.slot_number);
      const result = buildSlotRosterImport(sheet, mapping, {
        mode: useSlotColumn ? 'slot_column' : 'single_slot',
        targetSlot: Number(targetSlot),
        replaceExisting,
        defaultPassword: mapping.password ? undefined : importDefaultPassword,
      });

      const nextSlots = enrichSlotsWithPasswords(
        slots.map((slot) => {
          const imported = result.bySlot.get(slot.slot_number);
          if (!imported?.length) return slot;
          return {
            ...slot,
            roster: replaceExisting
              ? imported
              : [...slot.roster, ...imported].slice(0, EXAM_SLOT_CAPACITY_DEFAULT),
          };
        }),
        importDefaultPassword,
      );

      const total = [...result.bySlot.values()].reduce((sum, rows) => sum + rows.length, 0);
      const slotSummary = [...result.bySlot.entries()]
        .map(([slotNumber, rows]) => `Slot ${slotNumber}: ${rows.length}`)
        .join(' · ');

      const message = `Imported ${total} student(s) (${slotSummary})${
        result.skipped ? ` · ${result.skipped} row(s) skipped` : ''
      }`;

      onImport(nextSlots, message);
      if (downloadAfterImport) {
        downloadRosterCredentialsCsv(
          nextSlots,
          `exam-roster-credentials-${new Date().toISOString().slice(0, 10)}.csv`,
          importDefaultPassword,
        );
      }
      handleClose(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(calc(100dvh-2rem),880px)] sm:w-full">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle>Import roster from Excel or CSV</DialogTitle>
          <DialogDescription>
            Upload your sheet, map columns to roster fields, then assign students to a slot.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium text-slate-800">Step 1 · Upload spreadsheet</p>
                <p className="text-xs text-slate-600 mt-2">
                  Supports .xlsx, .xls, and .csv with any column names. You will map columns in the next step.
                </p>
                <label className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0c2340] px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-[#1e3a5f]">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    disabled={loading}
                    onChange={(e) => {
                      void handleFileChange(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  {loading ? 'Reading file…' : 'Choose Excel / CSV file'}
                </label>
              </div>
            </div>
          ) : null}

          {step === 2 && sheet ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Step 2 · Map columns</p>
                <p className="text-xs text-slate-600 mt-1">
                  File: <span className="font-mono">{sheet.fileName}</span> · {sheet.rows.length} row(s)
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {ROSTER_COLUMN_FIELDS.map((field) => (
                  <label key={field.key} className="block text-xs font-medium text-slate-700">
                    {field.label}
                    {field.required ? ' *' : ''}
                    <Select
                      value={mapping[field.key] ?? NONE_VALUE}
                      onValueChange={(value) => updateMapping(field.key, value)}
                    >
                      <SelectTrigger className="mt-1 h-9 w-full">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[260] max-h-60">
                        <SelectItem value={NONE_VALUE}>Not mapped</SelectItem>
                        {sheet.headers.map((header, headerIndex) => (
                          <SelectItem key={`${header}-${headerIndex}`} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ))}
              </div>

              {!mapping.password ? (
                <label className="block text-xs font-medium text-slate-700">
                  Default password for students (when sheet has no password column)
                  <Input
                    className="mt-1 h-9"
                    value={importDefaultPassword}
                    onChange={(e) => setImportDefaultPassword(e.target.value)}
                    placeholder={DEFAULT_EXAM_STUDENT_PASSWORD}
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">
                    Used for login accounts created when admin approves the exam. Share via the credentials CSV.
                  </span>
                </label>
              ) : null}

              {previewRows.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Preview</p>
                  <div className="space-y-1 text-[11px] font-mono text-slate-600">
                    {previewRows.map((row) => (
                      <div key={row.roll_number}>
                        {row.roll_number}
                        {row.student_name ? ` · ${row.student_name}` : ''}
                        {row.branch ? ` · ${row.branch}` : ''}
                        {row.academic_year ? ` · Y${row.academic_year}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 3 && sheet ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Step 3 · Assign to slot(s)</p>
                <p className="text-xs text-slate-600 mt-1">
                  Choose how imported rows should be distributed across exam slots.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="assignmentMode"
                    checked={assignmentMode === 'single_slot'}
                    onChange={() => setAssignmentMode('single_slot')}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    Assign all rows to one slot
                    {assignmentMode === 'single_slot' ? (
                      <Select value={targetSlot} onValueChange={setTargetSlot}>
                        <SelectTrigger className="mt-2 h-9 w-full max-w-[12rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[260]">
                          {Array.from({ length: EXAM_SLOT_COUNT }, (_, i) => i + 1).map((slotNumber) => (
                            <SelectItem key={slotNumber} value={String(slotNumber)}>
                              Slot {slotNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </span>
                </label>

                <label
                  className={`flex items-start gap-2 text-sm ${mapping.slot_number ? 'text-slate-700' : 'text-slate-400'}`}
                >
                  <input
                    type="radio"
                    name="assignmentMode"
                    checked={assignmentMode === 'slot_column'}
                    disabled={!mapping.slot_number}
                    onChange={() => setAssignmentMode('slot_column')}
                    className="mt-1"
                  />
                  <span>
                    Use slot column from sheet
                    {mapping.slot_number ? (
                      <span className="block text-xs text-slate-500 mt-1">
                        Mapped column: <span className="font-mono">{mapping.slot_number}</span>
                      </span>
                    ) : (
                      <span className="block text-xs mt-1">Map a slot column in step 2 to enable this.</span>
                    )}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={downloadAfterImport}
                    onChange={(e) => setDownloadAfterImport(e.target.checked)}
                  />
                  Download student credentials CSV after import (roll, email, password)
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                  />
                  Replace existing roster for affected slot(s)
                </label>
              </div>
            </div>
          ) : null}
        </div>

        {step === 2 ? (
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-background px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              disabled={!canContinueFromMapping}
              onClick={() => {
                setAssignmentMode(mapping.slot_number ? 'slot_column' : 'single_slot');
                setStep(3);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        ) : null}

        {step === 3 ? (
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-background px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" onClick={handleImport}>
              Import roster
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
