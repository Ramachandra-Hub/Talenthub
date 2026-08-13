import type { AssessmentFormat } from '@/lib/exams/programming-subjects';
import type { SubjectRubricConfig } from '@/lib/exams/pro-exam-rubric';

export type SubjectDto = {
  id: string;
  subject_name: string;
  slug: string;
  status: string;
  assessment_format?: AssessmentFormat;
  is_programming?: boolean;
  rubric_config?: SubjectRubricConfig | null;
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
  faculty_exam_request_id?: string | null;
  published_test_id?: string | null;
  open_link_enabled?: boolean;
  open_link_token?: string | null;
  open_link_password?: string | null;
  subjects: SubjectDto[];
};

export type ExamSubjectSelection = {
  subjectId: string;
  assessment_format?: AssessmentFormat;
  rubric_config?: SubjectRubricConfig | null;
};
