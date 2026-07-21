'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  DepartmentGroupPicker,
} from '@/components/exam-builder/department-group-picker';
import {
  ExamSlotSchedulePanel,
  emptySlots,
} from '@/components/exam-builder/exam-slot-schedule-panel';
import { ACADEMIC_YEARS, DEPARTMENTS } from '@/lib/college-brand';
import type { ExamScheduleSlotInput } from '@/lib/exam-schedule-slots';
import {
  filterConfiguredScheduleSlots,
  validateSingleScheduleSlot,
} from '@/lib/exam-schedule-slots';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  assessmentFormatLabel,
  isProgrammingLanguageSubject,
  type AssessmentFormat,
} from '@/lib/exams/programming-subjects';

type Subject = {
  id: string;
  subject_name: string;
  slug: string;
  status: string;
  is_programming?: boolean;
  assessment_format?: AssessmentFormat;
};

type ExamSummary = {
  id: string;
  title: string;
  duration: number;
  total_marks: number;
  passing_marks: number;
  start_time: string;
  end_time: string;
  status: string;
  subjects_count: number;
  created_at: string;
};

type ExamDetails = {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  total_marks: number;
  passing_marks: number;
  start_time: string;
  end_time: string;
  status: string;
  faculty_exam_request_id?: string | null;
  published_test_id?: string | null;
  subjects: Subject[];
};

type FormState = {
  title: string;
  description: string;
  duration: number;
  total_marks: number;
  passing_marks: number;
  start_time: string;
  end_time: string;
  status: string;
};

const DEFAULT_SUBJECTS = [
  'Aptitude',
  'Logical Reasoning',
  'Verbal Ability',
  'C Programming',
  'Java',
  'Python',
  'SQL',
  'DBMS',
  'Data Structures',
  'Operating Systems',
  'Computer Networks',
  'Web Development',
  'AI',
  'Machine Learning',
];

function defaultForm(): FormState {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    duration: 60,
    total_marks: 100,
    passing_marks: 35,
    start_time: now.toISOString().slice(0, 16),
    end_time: inOneHour.toISOString().slice(0, 16),
    status: 'draft',
  };
}

export default function AdminExamsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subjectFormats, setSubjectFormats] = useState<Record<string, AssessmentFormat>>({});
  const [formatDialogSubject, setFormatDialogSubject] = useState<Subject | null>(null);
  const [pendingFormat, setPendingFormat] = useState<AssessmentFormat>('mcq');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedTestId, setPublishedTestId] = useState<string | null>(null);
  const [department, setDepartment] = useState<string>(DEPARTMENTS[0] ?? '');
  const [departmentGroupId, setDepartmentGroupId] = useState('');
  const [targetYears, setTargetYears] = useState<string[]>([...ACADEMIC_YEARS]);
  const [usesSlotScheduling, setUsesSlotScheduling] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<ExamScheduleSlotInput[]>(emptySlots);
  const [publishedSlotNumbers, setPublishedSlotNumbers] = useState<number[]>([]);
  const [publishingSlotNumber, setPublishingSlotNumber] = useState<number | null>(null);
  const [questionsPerSubject, setQuestionsPerSubject] = useState(5);
  const [subjectPage, setSubjectPage] = useState(1);
  const pageSize = 100;

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return subjects.filter((s) => s.subject_name.toLowerCase().includes(q));
  }, [subjects, subjectSearch]);

  const pagedSubjects = useMemo(() => {
    const start = (subjectPage - 1) * pageSize;
    return filteredSubjects.slice(start, start + pageSize);
  }, [filteredSubjects, subjectPage]);

  const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / pageSize));

  const canSave = form.title.trim().length > 0 && selectedIds.length > 0 && !saving;

  useEffect(() => {
    const warnBeforeClose = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [dirty]);

  const loadSubjects = async () => {
    let res: Response;
    try {
      res = await fetch('/api/subjects?page=1&pageSize=500', {
        credentials: 'include',
        cache: 'no-store',
      });
    } catch {
      throw new Error(
        'Could not reach the server. Open http://localhost:3000 (not 3002) and make sure the dev server is running.',
      );
    }
    const json = (await res.json().catch(() => ({}))) as {
      subjects?: Subject[];
      error?: string;
      hint?: string;
    };
    if (!res.ok) {
      throw new Error([json.error ?? 'Could not load subjects', json.hint].filter(Boolean).join(' — '));
    }
    setSubjects(json.subjects ?? []);
  };

  const loadExams = async () => {
    let res: Response;
    try {
      res = await fetch('/api/exams', { credentials: 'include', cache: 'no-store' });
    } catch {
      throw new Error(
        'Could not reach the server. Open http://localhost:3000 (not 3002) and make sure the dev server is running.',
      );
    }
    const json = (await res.json().catch(() => ({}))) as {
      exams?: ExamSummary[];
      error?: string;
      hint?: string;
    };
    if (!res.ok) {
      throw new Error([json.error ?? 'Could not load exams', json.hint].filter(Boolean).join(' — '));
    }
    setExams(json.exams ?? []);
  };

  const seedDefaultSubjects = async () => {
    for (const subjectName of DEFAULT_SUBJECTS) {
      await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject_name: subjectName, status: 'active' }),
      });
    }
  };

  const initialize = async () => {
    setLoading(true);
    setError(null);
    try {
      await loadSubjects();
      await loadExams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void initialize();
  }, []);

  const slot1 = scheduleSlots.find((slot) => slot.slot_number === 1);
  const slotsValid =
    !usesSlotScheduling || (Boolean(slot1) && validateSingleScheduleSlot(slot1!) === null);

  const resetForm = () => {
    setSelectedExamId(null);
    setForm(defaultForm());
    setSelectedIds([]);
    setSubjectFormats({});
    setFormatDialogSubject(null);
    setPublishedTestId(null);
    setUsesSlotScheduling(false);
    setScheduleSlots(emptySlots());
    setPublishedSlotNumbers([]);
    setDirty(false);
  };

  const loadPublishedSlotState = async (examId: string) => {
    const res = await fetch(`/api/exams/${examId}/slots`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      slots?: { slot_number: number }[];
      uses_slot_scheduling?: boolean;
      configured_slots?: ExamScheduleSlotInput[];
    };
    setPublishedSlotNumbers((json.slots ?? []).map((slot) => slot.slot_number));
    if (json.uses_slot_scheduling) setUsesSlotScheduling(true);
    if (json.configured_slots?.length) {
      const configuredByNumber = new Map(
        json.configured_slots.map((slot) => [slot.slot_number, slot]),
      );
      setScheduleSlots(
        emptySlots().map((slot) => configuredByNumber.get(slot.slot_number) ?? slot),
      );
    }
  };

  const loadExamDetails = async (examId: string) => {
    setError(null);
    const res = await fetch(`/api/exams/${examId}`, { credentials: 'include' });
    const json = (await res.json()) as { exam?: ExamDetails; error?: string };
    if (!res.ok || !json.exam) throw new Error(json.error ?? 'Could not load exam details');
    const exam = json.exam;
    setSelectedExamId(exam.id);
    setPublishedTestId(exam.published_test_id ?? null);
    await loadPublishedSlotState(exam.id);
    setForm({
      title: exam.title,
      description: exam.description ?? '',
      duration: exam.duration,
      total_marks: exam.total_marks,
      passing_marks: exam.passing_marks,
      start_time: exam.start_time.slice(0, 16),
      end_time: exam.end_time.slice(0, 16),
      status: exam.status,
    });
    setSelectedIds(exam.subjects.map((s) => s.id));
    const formats: Record<string, AssessmentFormat> = {};
    for (const s of exam.subjects) {
      formats[s.id] = (s.assessment_format as AssessmentFormat | undefined) ?? 'mcq';
    }
    setSubjectFormats(formats);
    setDirty(false);
    setSuccess(`Loaded "${exam.title}" for editing.`);
  };

  const subjectIsProgramming = (subject: Subject) =>
    Boolean(subject.is_programming) ||
    isProgrammingLanguageSubject({
      slug: subject.slug,
      subject_name: subject.subject_name,
    });

  const toggleSubject = (id: string) => {
    const subject = subjects.find((s) => s.id === id);
    if (!subject) return;

    if (selectedIds.includes(id)) {
      setDirty(true);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      setSubjectFormats((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    if (subjectIsProgramming(subject)) {
      setPendingFormat(subjectFormats[id] ?? 'mcq');
      setFormatDialogSubject(subject);
      return;
    }

    setDirty(true);
    setSelectedIds((prev) => [...prev, id]);
    setSubjectFormats((prev) => ({ ...prev, [id]: 'mcq' }));
  };

  const confirmProgrammingFormat = () => {
    if (!formatDialogSubject) return;
    const id = formatDialogSubject.id;
    setDirty(true);
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSubjectFormats((prev) => ({ ...prev, [id]: pendingFormat }));
    setFormatDialogSubject(null);
  };

  const changeProgrammingFormat = (id: string) => {
    const subject = subjects.find((s) => s.id === id);
    if (!subject || !subjectIsProgramming(subject)) return;
    setPendingFormat(subjectFormats[id] ?? 'mcq');
    setFormatDialogSubject(subject);
  };

  const selectAllFiltered = () => {
    setDirty(true);
    const programming = filteredSubjects.filter((s) => subjectIsProgramming(s) && !selectedIds.includes(s.id));
    if (programming.length) {
      setError(
        `Select programming subjects one by one so you can choose MCQ, Coding, or Both for: ${programming
          .slice(0, 3)
          .map((s) => s.subject_name)
          .join(', ')}${programming.length > 3 ? '…' : ''}`,
      );
    }
    setSelectedIds((prev) => {
      const merged = new Set(prev);
      const nextFormats = { ...subjectFormats };
      for (const s of filteredSubjects) {
        if (subjectIsProgramming(s)) continue;
        merged.add(s.id);
        nextFormats[s.id] = 'mcq';
      }
      setSubjectFormats(nextFormats);
      return [...merged];
    });
  };

  const deselectAllFiltered = () => {
    setDirty(true);
    const ids = new Set(filteredSubjects.map((s) => s.id));
    setSelectedIds((prev) => prev.filter((id) => !ids.has(id)));
    setSubjectFormats((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  };

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Exam title is required.';
    if (!selectedIds.length) return 'Select at least one subject.';
    for (const id of selectedIds) {
      const subject = subjects.find((s) => s.id === id);
      if (!subject) continue;
      if (subjectIsProgramming(subject) && !subjectFormats[id]) {
        return `Choose MCQ, Coding, or Both for ${subject.subject_name}.`;
      }
    }
    if (form.passing_marks > form.total_marks) return 'Passing marks cannot exceed total marks.';
    if (new Date(form.start_time).getTime() >= new Date(form.end_time).getTime()) {
      return 'End date-time must be after start date-time.';
    }
    return null;
  };

  const saveExam = async (): Promise<string | null> => {
    setError(null);
    setSuccess(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        subjectIds: selectedIds,
        subjectFormats,
        subjects: selectedIds.map((subjectId) => ({
          subjectId,
          assessment_format: subjectFormats[subjectId] ?? 'mcq',
        })),
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
      };
      const url = selectedExamId ? `/api/exams/${selectedExamId}` : '/api/exams';
      const method = selectedExamId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; examId?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');

      const newId = json.examId ?? selectedExamId;
      if (newId) setSelectedExamId(newId);
      await loadExams();
      if (newId) await loadExamDetails(newId);
      setDirty(false);
      setSuccess(selectedExamId ? 'Exam updated successfully.' : 'Exam created successfully.');
      return newId ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publishExam = async () => {
    setError(null);
    setSuccess(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    if (!targetYears.length) {
      setError('Select at least one target year for scheduling.');
      return;
    }
    if (!departmentGroupId && !department) {
      setError('Choose a primary department or department group.');
      return;
    }
    if (usesSlotScheduling && !slotsValid) {
      setError(
        (slot1 ? validateSingleScheduleSlot(slot1) : null) ??
          'Complete Slot 1 date, time, and roster. Other slots can be published later.',
      );
      return;
    }

    setPublishing(true);
    try {
      let examId = selectedExamId;
      if (!examId || dirty) {
        examId = await saveExam();
      }
      if (!examId) throw new Error('Save the exam before publishing.');

      const res = await fetch(`/api/exams/${examId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          department,
          departmentGroupId: departmentGroupId || undefined,
          targetYears,
          usesSlotScheduling,
          scheduleSlots: usesSlotScheduling ? scheduleSlots : undefined,
          questionsPerSubject,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        takeUrl?: string;
        testId?: string;
        warnings?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? 'Publish failed');

      setPublishedTestId(json.testId ?? null);
      if (usesSlotScheduling) {
        setPublishedSlotNumbers((prev) => [...new Set([...prev, 1])]);
      }
      setForm((prev) => ({ ...prev, status: 'published' }));
      await loadExams();
      const warn =
        json.warnings?.length ? ` ${json.warnings.join(' ')}` : '';
      setSuccess(
        `${json.message ?? 'Exam published.'}${warn} Use Live Dashboard and Test Reports for individual and consolidated PDFs.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const publishIndividualSlot = async (slotNumber: number) => {
    if (!selectedExamId || !publishedTestId) {
      setError('Publish Slot 1 and the exam first.');
      return;
    }
    const slot = scheduleSlots.find((row) => row.slot_number === slotNumber);
    if (!slot) return;
    const validationError = validateSingleScheduleSlot(slot);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSuccess(null);
    setPublishingSlotNumber(slotNumber);
    try {
      const res = await fetch(`/api/exams/${selectedExamId}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slot_number: slotNumber, slot }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Could not publish Slot ${slotNumber}.`);

      setPublishedSlotNumbers((prev) => [...new Set([...prev, slotNumber])]);
      setSuccess(
        json.message ??
          `Slot ${slotNumber} published independently. Other slots were not changed.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Slot publish failed');
    } finally {
      setPublishingSlotNumber(null);
    }
  };

  const deleteExam = async () => {
    if (!selectedExamId) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/exams/${selectedExamId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      await loadExams();
      resetForm();
      setSuccess('Exam deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-slate-600 animate-pulse">Loading Exam Builder…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AdminPageHeader
        title="Exam Builder"
        description="Create exams by name and subjects, schedule for students, then use Live Dashboard and Test Reports for the same individual and consolidated PDF exports as before."
      />
      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}

      <div className="grid xl:grid-cols-[360px_1fr] gap-5">
        <Card className="p-4 space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Exams</h3>
            <Button size="sm" variant="outline" onClick={resetForm}>
              New exam
            </Button>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {exams.length === 0 ? (
              <p className="text-sm text-slate-500">No exams yet.</p>
            ) : (
              exams.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => void loadExamDetails(exam.id)}
                  className={`w-full text-left rounded-lg border p-3 transition ${
                    selectedExamId === exam.id
                      ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className="font-medium text-slate-900 truncate">{exam.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {exam.subjects_count} subjects · {exam.duration} min
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(exam.start_time).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exam title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((prev) => ({ ...prev, title: e.target.value }));
                  }}
                  placeholder="Placement Assessment"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exam description</label>
                <Input
                  value={form.description}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((prev) => ({ ...prev, description: e.target.value }));
                  }}
                  placeholder="Optional description"
                />
              </div>
              <NumberField label="Duration (minutes)" value={form.duration} onChange={(v) => setForm((p) => ({ ...p, duration: v }))} onDirty={() => setDirty(true)} />
              <NumberField label="Total marks" value={form.total_marks} onChange={(v) => setForm((p) => ({ ...p, total_marks: v }))} onDirty={() => setDirty(true)} />
              <NumberField label="Passing marks" value={form.passing_marks} onChange={(v) => setForm((p) => ({ ...p, passing_marks: v }))} onDirty={() => setDirty(true)} />
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
                <select
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={form.status}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((prev) => ({ ...prev, status: e.target.value }));
                  }}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start date & time</label>
                <Input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((prev) => ({ ...prev, start_time: e.target.value }));
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">End date & time</label>
                <Input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((prev) => ({ ...prev, end_time: e.target.value }));
                  }}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Subject selection</h3>
                <p className="text-xs text-slate-500">
                  Selected Subjects: <span className="font-semibold text-slate-700">{selectedIds.length}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAllFiltered}>
                  Deselect All
                </Button>
                {subjects.length === 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await seedDefaultSubjects();
                      await loadSubjects();
                      setSuccess('Default subjects seeded.');
                    }}
                  >
                    Seed default subjects
                  </Button>
                ) : null}
              </div>
            </div>

            <Input
              placeholder="Search subject..."
              value={subjectSearch}
              onChange={(e) => {
                setSubjectSearch(e.target.value);
                setSubjectPage(1);
              }}
            />

            <p className="text-xs text-slate-500">
              Programming subjects (C, Java, Python, etc.) will ask whether to use{' '}
              <strong>MCQ</strong>, <strong>Coding problems</strong>, or <strong>Both</strong>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-2">
              {pagedSubjects.map((subject) => {
                const active = selectedIds.includes(subject.id);
                const programming = subjectIsProgramming(subject);
                const format = subjectFormats[subject.id] ?? 'mcq';
                return (
                  <div
                    key={subject.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      active
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={active}
                        onChange={() => toggleSubject(subject.id)}
                        aria-label={`Select ${subject.subject_name}`}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium leading-snug">{subject.subject_name}</span>
                        {programming ? (
                          <span className="block text-[11px] opacity-80 mt-0.5">
                            Programming language
                          </span>
                        ) : null}
                      </span>
                    </label>
                    {active && programming ? (
                      <button
                        type="button"
                        className="mt-2 text-[11px] font-semibold underline underline-offset-2"
                        onClick={() => changeProgrammingFormat(subject.id)}
                      >
                        Mode: {assessmentFormatLabel(format)} (change)
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {filteredSubjects.length > pageSize ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(subjectPage - 1) * pageSize + 1}-
                  {Math.min(subjectPage * pageSize, filteredSubjects.length)} of {filteredSubjects.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={subjectPage <= 1}
                    onClick={() => setSubjectPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={subjectPage >= totalPages}
                    onClick={() => setSubjectPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900">Schedule for students</h3>
              <p className="text-xs text-slate-500 mt-1">
                Publishing creates the same faculty exam, schedules, and student portal entry as the
                legacy exam builder. Results appear on{' '}
                <Link href="/admin/live-dashboard" className="text-[#1e3a5f] font-semibold underline">
                  Live Dashboard
                </Link>{' '}
                and{' '}
                <Link href="/admin/reports" className="text-[#1e3a5f] font-semibold underline">
                  Test Reports
                </Link>{' '}
                (individual + consolidated PDF downloads).
              </p>
              {publishedTestId ? (
                <p className="text-xs text-emerald-700 mt-2 font-medium">
                  Published · test id {publishedTestId}
                </p>
              ) : null}
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

            <DepartmentGroupPicker
              value={departmentGroupId}
              onChange={setDepartmentGroupId}
              primaryDepartment={department}
            />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Target years
              </p>
              <div className="flex flex-wrap gap-3">
                {ACADEMIC_YEARS.map((year) => (
                  <label key={year} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={targetYears.includes(year)}
                      onChange={() => {
                        setTargetYears((prev) =>
                          prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
                        );
                      }}
                    />
                    {year}
                  </label>
                ))}
              </div>
            </div>

            <NumberField
              label="MCQs per subject (from question bank)"
              value={questionsPerSubject}
              onChange={setQuestionsPerSubject}
              onDirty={() => undefined}
            />

            <ExamSlotSchedulePanel
              enabled={usesSlotScheduling}
              onEnabledChange={(v) => {
                setUsesSlotScheduling(v);
                if (v && scheduleSlots.length === 0) setScheduleSlots(emptySlots());
              }}
              slots={scheduleSlots}
              onSlotsChange={setScheduleSlots}
              lockedSlotNumbers={publishedSlotNumbers}
              slotPublishHint="Each slot is independent. Publish Slot 1 when ready; Slots 2–8 can remain empty and be configured and published later."
            />

            {usesSlotScheduling && publishedTestId ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  Publish configured slots individually
                </p>
                <p className="text-xs text-slate-500">
                  Publishing one slot does not require, modify, or publish any other slot.
                </p>
                <div className="flex flex-wrap gap-2">
                  {filterConfiguredScheduleSlots(scheduleSlots).map((slot) => {
                    const published = publishedSlotNumbers.includes(slot.slot_number);
                    return (
                      <Button
                        key={slot.slot_number}
                        type="button"
                        size="sm"
                        variant={published ? 'outline' : 'default'}
                        disabled={published || publishingSlotNumber != null}
                        onClick={() => void publishIndividualSlot(slot.slot_number)}
                      >
                        {published
                          ? `Slot ${slot.slot_number} published`
                          : publishingSlotNumber === slot.slot_number
                            ? `Publishing Slot ${slot.slot_number}…`
                            : `Publish Slot ${slot.slot_number}`}
                      </Button>
                    );
                  })}
                  {filterConfiguredScheduleSlots(scheduleSlots).length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Configure a slot date, time, and roster to enable its publish button.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!usesSlotScheduling ? (
              <p className="text-xs text-slate-500">
                With 8-slot mode off, the exam window uses the start and end date-times above. Students
                see the exam on their portal during that window.
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Exam details preview</h3>
            <div className="text-sm text-slate-700 space-y-1">
              <p><strong>Exam Title:</strong> {form.title || '—'}</p>
              <p><strong>Description:</strong> {form.description || '—'}</p>
              <p><strong>Duration:</strong> {form.duration} min</p>
              <p><strong>Marks:</strong> {form.total_marks}</p>
              <p><strong>Passing Marks:</strong> {form.passing_marks}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {subjects
                .filter((s) => selectedIds.includes(s.id))
                .map((s) => (
                  <Badge key={s.id} tone="neutral">
                    {s.subject_name}
                    {subjectIsProgramming(s)
                      ? ` · ${assessmentFormatLabel(subjectFormats[s.id] ?? 'mcq')}`
                      : ''}
                  </Badge>
                ))}
            </div>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={Boolean(formatDialogSubject)}
        onOpenChange={(open) => {
          if (!open) setFormatDialogSubject(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              How should {formatDialogSubject?.subject_name ?? 'this language'} be assessed?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose whether this programming subject should use MCQs, coding problems, or both in
              the exam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2">
            {(
              [
                { id: 'mcq', title: 'MCQ only', hint: 'Objective questions on the language' },
                { id: 'coding', title: 'Coding problems only', hint: 'Write and run code' },
                { id: 'both', title: 'Both MCQ + Coding', hint: 'Theory MCQs plus coding tasks' },
              ] as const
            ).map((option) => (
              <label
                key={option.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                  pendingFormat === option.id
                    ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="assessment-format"
                  className="mt-1"
                  checked={pendingFormat === option.id}
                  onChange={() => setPendingFormat(option.id)}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                  <span className="block text-xs text-slate-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmProgrammingFormat}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="sticky bottom-0 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 flex flex-wrap gap-2 justify-end shadow-lg">
        {selectedExamId ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete exam'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this exam?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete the exam and all exam-subject mappings. Subjects will remain.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteExam()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <Button variant="outline" onClick={resetForm}>
          Reset
        </Button>
        <Button onClick={() => void saveExam()} disabled={!canSave}>
          {saving ? 'Saving…' : selectedExamId ? 'Update Exam' : 'Create Exam'}
        </Button>
        <Button
          variant="default"
          className="bg-[#1e3a5f] hover:bg-[#162d4a]"
          disabled={!canSave || publishing || Boolean(publishedTestId)}
          onClick={() => void publishExam()}
        >
          {publishing ? 'Publishing…' : publishedTestId ? 'Already published' : 'Publish & schedule'}
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onDirty,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onDirty: () => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <Input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          onDirty();
          onChange(Number(e.target.value) || 0);
        }}
      />
    </div>
  );
}
