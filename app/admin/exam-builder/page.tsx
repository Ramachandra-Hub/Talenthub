'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusAlert } from '@/components/ui/status-alert';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { ExamBuilderControls } from '@/components/exam-builder/exam-builder-controls';
import { QuestionBankUploadPanel } from '@/components/exam-builder/question-bank-upload-panel';
import { DepartmentGroupPicker } from '@/components/exam-builder/department-group-picker';
import {
  ExamSlotSchedulePanel,
  emptySlots,
} from '@/components/exam-builder/exam-slot-schedule-panel';
import { McqUploadFormatGuide } from '@/components/exam-builder/mcq-upload-format-guide';
import { ACADEMIC_YEARS, DEPARTMENTS } from '@/lib/college-brand';
import { getExamBuilderTestType } from '@/lib/exam-builder/test-catalog';
import { isElevateXBuilderTestType } from '@/lib/exam-builder/elevatex-exam';
import { ELEVATEX_EXAM_NAME } from '@/lib/elevatex';
import type { ExamScheduleSlotInput } from '@/lib/exam-schedule-slots';
import {
  validateScheduleSlots,
  validateElevateXPublishSlots,
  validateOptionalConfiguredSlots,
} from '@/lib/exam-schedule-slots';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { parseMcqCsv, parseMcqPlainText } from '@/lib/exam-builder/parse-manual-mcqs';
import { cn } from '@/lib/utils';

export default function AdminExamBuilderPage() {
  const [testType, setTestType] = useState('aptitude');
  const [slotKey, setSlotKey] = useState('slot-1');
  const [syllabusTopicIds, setSyllabusTopicIds] = useState<string[]>([]);
  const [questionsPerTopic, setQuestionsPerTopic] = useState(5);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<string>(DEPARTMENTS[0] ?? '');
  const [departmentGroupId, setDepartmentGroupId] = useState('');
  const [targetYears, setTargetYears] = useState<string[]>([...ACADEMIC_YEARS]);
  const [duration, setDuration] = useState(45);
  const [goLiveNow, setGoLiveNow] = useState(true);

  const [questions, setQuestions] = useState<FacultyExamQuestion[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDepts, setNewGroupDepts] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [usesSlotScheduling, setUsesSlotScheduling] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<ExamScheduleSlotInput[]>(emptySlots);
  const [manualPaste, setManualPaste] = useState('');
  const [goLiveSlot1OnPublish, setGoLiveSlot1OnPublish] = useState(true);

  const testDef = getExamBuilderTestType(testType);
  const isManual = testType === 'department-manual';
  const isElevateX = isElevateXBuilderTestType(testType);
  const needsSyllabus = Boolean(testDef?.requiresSyllabus);
  const elevateXSlotsValid =
    validateElevateXPublishSlots(scheduleSlots) === null &&
    validateOptionalConfiguredSlots(scheduleSlots) === null;
  const deptSlotsValid = validateScheduleSlots(scheduleSlots) === null;
  const slotsValid = !usesSlotScheduling || (isElevateX ? elevateXSlotsValid : deptSlotsValid);
  const slotValidationError = usesSlotScheduling
    ? isElevateX
      ? validateElevateXPublishSlots(scheduleSlots) ??
        validateOptionalConfiguredSlots(scheduleSlots)
      : validateScheduleSlots(scheduleSlots)
    : null;

  const toggleYear = (year: string) =>
    setTargetYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    );

  const toggleNewGroupDept = (dept: string) =>
    setNewGroupDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept],
    );

  const createGroup = async () => {
    if (!newGroupName.trim() || newGroupDepts.length === 0) {
      setError('Enter a group name and select at least one department.');
      return;
    }
    setCreatingGroup(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/department-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim(), departments: newGroupDepts }),
      });
      const json = (await res.json()) as { error?: string; group?: { id: string } };
      if (!res.ok) throw new Error(json.error ?? 'Could not create group');
      if (json.group?.id) setDepartmentGroupId(json.group.id);
      setNewGroupName('');
      setNewGroupDepts([]);
      setSuccess('Department group created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const parseManualPaper = (raw: string, format: 'text' | 'csv' = 'text') => {
    const parsed = format === 'csv' ? parseMcqCsv(raw) : parseMcqPlainText(raw);
    if (!parsed.questions.length) {
      setError('Could not parse any MCQs. Check the format guide and try again.');
      return;
    }
    setQuestions(parsed.questions);
    setWarnings(parsed.warnings);
    setSuccess(`Parsed ${parsed.questions.length} MCQs from ${format === 'csv' ? 'CSV' : 'text'}.`);
    setError(null);
  };

  const onManualFile = async (file: File | null) => {
    if (!file) return;
    setParsingManual(true);
    setError(null);
    try {
      const name = file.name.toLowerCase();
      const text = await file.text();
      parseManualPaper(text, name.endsWith('.csv') ? 'csv' : 'text');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file');
    } finally {
      setParsingManual(false);
    }
  };

  const publish = async () => {
    setError(null);
    setSuccess(null);
    setTakeUrl(null);

    if (needsSyllabus && !syllabusTopicIds.length) {
      setError('Select syllabus topics before publishing.');
      return;
    }
    if (isElevateX && !usesSlotScheduling) {
      setError('Enable 8-slot scheduling and upload the student roster for ElevateX.');
      return;
    }
    if (usesSlotScheduling && !slotsValid) {
      setError(
        isElevateX
          ? (slotValidationError ??
              'Complete Slot 1 with date, time, and at least one student.')
          : 'Complete all 8 slots with date, time, and at least one student per slot.',
      );
      return;
    }
    if (!questions.length && !needsSyllabus && !isElevateX) {
      setError('Add MCQs by pasting or uploading a question paper below.');
      return;
    }
    if (!departmentGroupId && !department) {
      setError('Choose a primary department or department group.');
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch('/api/admin/exam-builder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testType,
          slotKey,
          topicIds: syllabusTopicIds,
          questionsPerTopic,
          title: title.trim() || `${testDef?.name ?? 'Exam'} Examination`,
          description: description.trim() || undefined,
          department,
          departmentGroupId: departmentGroupId || undefined,
          targetYears,
          durationMinutes: duration,
          goLiveNow: usesSlotScheduling ? false : goLiveNow,
          usesSlotScheduling: isElevateX || usesSlotScheduling,
          scheduleSlots: isElevateX || usesSlotScheduling ? scheduleSlots : undefined,
          goLiveSlotNumbers:
            usesSlotScheduling && !isElevateX && goLiveSlot1OnPublish ? [1] : undefined,
          questions: questions.length ? questions : undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        takeUrl?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Publish failed');

      setSuccess(json.message ?? 'Exam published.');
      setTakeUrl(json.takeUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <AdminPageHeader
        title="Exam builder"
        description="Create exams, configure slot schedules, and publish directly. Go live per slot from Exam schedules."
      />

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}
      {warnings.length ? <StatusAlert variant="info">{warnings.join(' ')}</StatusAlert> : null}

      <Card className="p-6 space-y-6">
        <ExamBuilderControls
          testType={testType}
          onTestTypeChange={(id) => {
            setTestType(id);
            const def = getExamBuilderTestType(id);
            if (def && !title.trim()) setTitle(`${def.name} Examination`);
            if (def) {
              setDuration(def.defaultDurationMinutes);
              setQuestionsPerTopic(def.defaultQuestionsPerTopic);
            }
            if (isElevateXBuilderTestType(id)) {
              setUsesSlotScheduling(true);
              if (scheduleSlots.length === 0) setScheduleSlots(emptySlots());
              if (!title.trim()) setTitle(`${ELEVATEX_EXAM_NAME} Examination`);
              setGoLiveNow(false);
            }
            setQuestions([]);
            setWarnings([]);
          }}
          slotKey={slotKey}
          onSlotKeyChange={setSlotKey}
          selectedTopicIds={syllabusTopicIds}
          onSelectedTopicIdsChange={setSyllabusTopicIds}
          questionsPerTopic={questionsPerTopic}
          onQuestionsPerTopicChange={setQuestionsPerTopic}
          onQuestionsGenerated={(qs, w) => {
            setQuestions(qs);
            setWarnings(w);
          }}
          catalogRefreshToken={catalogRefresh}
        />

        {!isElevateX && !isManual ? (
          <QuestionBankUploadPanel
            tagIds={syllabusTopicIds}
            onBankUpdated={() => setCatalogRefresh((n) => n + 1)}
          />
        ) : null}

        {!isElevateX && isManual ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="text-sm font-semibold text-[#0c2340]">Manual MCQ paper</h4>
            <p className="text-xs text-slate-600">
              Paste questions or upload CSV / plain text. Use the format guide for PDF-style blocks.
            </p>
            <McqUploadFormatGuide />
            <textarea
              className="w-full min-h-[140px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              value={manualPaste}
              onChange={(e) => setManualPaste(e.target.value)}
              placeholder="Paste MCQs here…"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={parsingManual || !manualPaste.trim()}
                onClick={() => parseManualPaper(manualPaste.trim(), 'text')}
              >
                Parse pasted text
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  onChange={(e) => void onManualFile(e.target.files?.[0] ?? null)}
                />
                {parsingManual ? 'Reading…' : 'Upload CSV / text file'}
              </label>
            </div>
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Exam title
            </label>
            <Input
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Aptitude · Slot 1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Duration (minutes)
            </label>
            <Input
              type="number"
              min={5}
              max={180}
              className="mt-1"
              value={duration}
              disabled={isElevateX}
              onChange={(e) => setDuration(Number(e.target.value) || 45)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Description
            </label>
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — shown on the test card"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Primary department
            </label>
            <select
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Target years
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACADEMIC_YEARS.map((y) => {
                const active = targetYears.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => toggleYear(y)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition',
                      active
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400',
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DepartmentGroupPicker
          value={departmentGroupId}
          onChange={setDepartmentGroupId}
          primaryDepartment={department}
        />

        <ExamSlotSchedulePanel
          enabled={isElevateX || usesSlotScheduling}
          onEnabledChange={(v) => {
            if (isElevateX) return;
            setUsesSlotScheduling(v);
            if (v && scheduleSlots.length === 0) setScheduleSlots(emptySlots());
            if (v) setGoLiveNow(false);
          }}
          slots={scheduleSlots}
          onSlotsChange={setScheduleSlots}
          lockEnabled={isElevateX}
          slotPublishHint={
            isElevateX
              ? 'Only Slot 1 is required to publish. Slots 2–8 can stay empty until you schedule them.'
              : undefined
          }
        />

        {!usesSlotScheduling && !isElevateX ? (
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={goLiveNow}
              onChange={(e) => setGoLiveNow(e.target.checked)}
              className="rounded border-slate-300"
            />
            Go live immediately for the selected group and years
          </label>
        ) : (
          <div className="space-y-3">
            {isElevateX ? (
              <StatusAlert variant="info">
                <strong>Publish with slot schedules</strong> marks every configured slot as live
                immediately. Each student can start only during their assigned slot time — access is
                matched by <strong>roll number</strong> on the slot roster.
              </StatusAlert>
            ) : (
              <StatusAlert variant="info">
                Slots go live <strong>one at a time</strong> in order (Slot 1 → 2 → … → 8). After
                publish, open Slot 1, then end it and open Slot 2 from{' '}
                <Link href="/admin/exam-schedules" className="font-semibold underline">
                  Exam schedules
                </Link>
                . Only roster students for that slot can take the exam during its window.
              </StatusAlert>
            )}
            {isElevateX && slotsValid ? (
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Slot 1 is required to publish. Add Slots 2–8 before publish, or later from{' '}
                <Link href="/admin/evalora-modules" className="font-semibold underline">
                  ElevateX &amp; modules
                </Link>
                .
              </p>
            ) : slotsValid ? (
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer rounded-xl border border-slate-200 bg-white p-4">
                <input
                  type="checkbox"
                  checked={goLiveSlot1OnPublish}
                  onChange={(e) => setGoLiveSlot1OnPublish(e.target.checked)}
                  disabled={!scheduleSlots[0]?.roster.length}
                  className="rounded border-slate-300"
                />
                Open Slot 1 immediately on publish (Slot 2+ only after you end the previous slot)
              </label>
            ) : slotValidationError ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {slotValidationError}
              </p>
            ) : null}
          </div>
        )}

        {questions.length > 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Question paper ready — {questions.length} MCQs
            </p>
            <p className="text-xs text-emerald-800 mt-1">
              Students in the department group see the exam once it is live.
            </p>
          </div>
        ) : needsSyllabus ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Generate the question paper above before publishing.
          </p>
        ) : isElevateX ? (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            ElevateX uses the fixed 6-section placement paper. Configure Slot 1 (and optional Slots 2–8), then publish — students take the exam only in their roster slot window.
          </p>
        ) : isManual ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Parse or upload MCQs above before publishing.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            disabled={
              publishing ||
              (isManual && !questions.length) ||
              (needsSyllabus && !questions.length) ||
              (isElevateX && (!usesSlotScheduling || !slotsValid)) ||
              (usesSlotScheduling && !slotsValid)
            }
            onClick={() => void publish()}
            className="bg-[#1e3a5f] hover:bg-[#16304f]"
          >
            {publishing
              ? 'Publishing…'
              : usesSlotScheduling || isElevateX
                ? 'Publish with slot schedules'
                : goLiveNow
                  ? 'Publish & go live'
                  : 'Publish exam'}
          </Button>
          {takeUrl ? (
            <Link href={takeUrl}>
              <Button variant="outline">Preview test →</Button>
            </Link>
          ) : null}
          <Link href="/admin/exam-schedules">
            <Button variant="ghost">Exam schedules →</Button>
          </Link>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-[#0c2340]">Create department group</h3>
        <p className="text-sm text-slate-600">
          Bundle branches so exams reach the right students in those departments.
        </p>
        <Input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="e.g. CSE + IT combined"
        />
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((d) => {
            const active = newGroupDepts.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleNewGroupDept(d)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition',
                  active
                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400',
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={creatingGroup}
          onClick={() => void createGroup()}
        >
          {creatingGroup ? 'Creating…' : 'Create group'}
        </Button>
      </Card>

      {questions.length > 0 ? (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-[#0c2340]">Generated questions</h3>
            <Badge tone="brand">{questions.length} MCQs</Badge>
          </div>
          <ul className="space-y-2 max-h-64 overflow-y-auto text-sm text-slate-700">
            {questions.slice(0, 8).map((q, i) => (
              <li key={i} className="border-b border-slate-100 pb-2">
                <span className="font-medium text-slate-500">Q{i + 1}. </span>
                {q.question_text.slice(0, 120)}
                {q.question_text.length > 120 ? '…' : ''}
              </li>
            ))}
            {questions.length > 8 ? (
              <li className="text-xs text-slate-500">…and {questions.length - 8} more</li>
            ) : null}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
