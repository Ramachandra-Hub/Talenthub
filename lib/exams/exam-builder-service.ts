import { prisma } from '@/lib/prisma';
import type {
  ExamDetailsDto,
  ExamSubjectSelection,
  ExamSummaryDto,
  SubjectDto,
} from '@/lib/exams/exam-builder-types';
import {
  isProgrammingLanguageSubject,
  normalizeAssessmentFormat,
  type AssessmentFormat,
} from '@/lib/exams/programming-subjects';

export function slugifySubjectName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseSubjectSelections(body: Record<string, unknown>): ExamSubjectSelection[] {
  if (Array.isArray(body.subjects) && body.subjects.length) {
    return (body.subjects as Record<string, unknown>[])
      .map((row) => {
        const subjectId = String(row.subjectId ?? row.subject_id ?? '').trim();
        if (!subjectId) return null;
        return {
          subjectId,
          assessment_format: normalizeAssessmentFormat(row.assessment_format ?? row.assessmentFormat),
        };
      })
      .filter(Boolean) as ExamSubjectSelection[];
  }

  const subjectIds = Array.isArray(body.subjectIds)
    ? (body.subjectIds as unknown[]).map((id) => String(id).trim()).filter(Boolean)
    : [];
  const formats =
    body.subjectFormats && typeof body.subjectFormats === 'object'
      ? (body.subjectFormats as Record<string, unknown>)
      : {};

  return [...new Set(subjectIds)].map((subjectId) => ({
    subjectId,
    assessment_format: normalizeAssessmentFormat(formats[subjectId]),
  }));
}

export function validateExamInput(body: Record<string, unknown>): string | null {
  const title = String(body.title ?? '').trim();
  if (!title) return 'Exam title is required.';
  const selections = parseSubjectSelections(body);
  if (selections.length === 0) return 'Select at least one subject.';
  const duration = Number(body.duration ?? 0);
  const totalMarks = Number(body.total_marks ?? 0);
  const passingMarks = Number(body.passing_marks ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return 'Duration must be a positive number.';
  if (!Number.isFinite(totalMarks) || totalMarks <= 0) return 'Total marks must be a positive number.';
  if (!Number.isFinite(passingMarks) || passingMarks < 0) return 'Passing marks must be zero or positive.';
  if (passingMarks > totalMarks) return 'Passing marks cannot exceed total marks.';
  const startTime = String(body.start_time ?? '').trim();
  const endTime = String(body.end_time ?? '').trim();
  if (!startTime || !endTime) return 'Start and end date-time are required.';
  if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
    return 'End date-time must be after start date-time.';
  }
  return null;
}

export async function resolveSubjectMappings(
  selections: ExamSubjectSelection[],
): Promise<{ subjectId: string; assessmentFormat: AssessmentFormat }[]> {
  const unique = new Map<string, AssessmentFormat>();
  for (const row of selections) {
    unique.set(row.subjectId, normalizeAssessmentFormat(row.assessment_format));
  }
  const ids = [...unique.keys()];
  const subjects = await prisma.subject.findMany({
    where: { id: { in: ids } },
    select: { id: true, subjectName: true, slug: true },
  });
  if (subjects.length !== ids.length) {
    throw new Error('One or more selected subjects were not found.');
  }

  return subjects.map((subject) => {
    const requested = unique.get(subject.id) ?? 'mcq';
    const isProgramming = isProgrammingLanguageSubject({
      slug: subject.slug,
      subjectName: subject.subjectName,
    });
    return {
      subjectId: subject.id,
      assessmentFormat: isProgramming ? requested : 'mcq',
    };
  });
}

export async function listSubjects(search: string, page: number, pageSize: number): Promise<{
  rows: SubjectDto[];
  total: number;
}> {
  const where = search
    ? {
        subjectName: {
          contains: search,
          mode: 'insensitive' as const,
        },
      }
    : undefined;
  const [rows, total] = await Promise.all([
    prisma.subject.findMany({
      where,
      orderBy: { subjectName: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, subjectName: true, slug: true, status: true },
    }),
    prisma.subject.count({ where }),
  ]);
  return {
    rows: rows.map((s) => ({
      id: s.id,
      subject_name: s.subjectName,
      slug: s.slug,
      status: s.status,
      is_programming: isProgrammingLanguageSubject({
        slug: s.slug,
        subjectName: s.subjectName,
      }),
    })),
    total,
  };
}

export async function listExams(): Promise<ExamSummaryDto[]> {
  const exams = await prisma.exam.findMany({
    orderBy: { createdAt: 'desc' },
    include: { subjects: { select: { id: true } } },
  });
  return exams.map((e) => ({
    id: e.id,
    title: e.title,
    duration: e.duration,
    total_marks: e.totalMarks,
    passing_marks: e.passingMarks,
    start_time: e.startTime.toISOString(),
    end_time: e.endTime.toISOString(),
    status: e.status,
    subjects_count: e.subjects.length,
    created_at: e.createdAt.toISOString(),
  }));
}

export async function getExamDetails(examId: string): Promise<ExamDetailsDto | null> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      subjects: {
        include: {
          subject: { select: { id: true, subjectName: true, slug: true, status: true } },
        },
      },
    },
  });
  if (!exam) return null;
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    duration: exam.duration,
    total_marks: exam.totalMarks,
    passing_marks: exam.passingMarks,
    start_time: exam.startTime.toISOString(),
    end_time: exam.endTime.toISOString(),
    status: exam.status,
    created_by: exam.createdBy,
    created_at: exam.createdAt.toISOString(),
    updated_at: exam.updatedAt.toISOString(),
    faculty_exam_request_id: exam.facultyExamRequestId,
    published_test_id: exam.publishedTestId,
    subjects: exam.subjects.map((x) => {
      const isProgramming = isProgrammingLanguageSubject({
        slug: x.subject.slug,
        subjectName: x.subject.subjectName,
      });
      return {
        id: x.subject.id,
        subject_name: x.subject.subjectName,
        slug: x.subject.slug,
        status: x.subject.status,
        assessment_format: normalizeAssessmentFormat(x.assessmentFormat),
        is_programming: isProgramming,
      };
    }),
  };
}
