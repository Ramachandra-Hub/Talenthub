import type { AssessmentFormat } from '@/lib/exams/programming-subjects';

export type SubjectDto = {
  id: string;
  subject_name: string;
  slug: string;
  status: string;
  assessment_format?: AssessmentFormat;
  is_programming?: boolean;
};

export type ExamSummaryDto = {
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

export type ExamDetailsDto = {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  total_marks: number;
  passing_marks: number;
  start_time: string;
  end_time: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  subjects: SubjectDto[];
};

export type ExamSubjectSelection = {
  subjectId: string;
  assessment_format?: AssessmentFormat;
};
