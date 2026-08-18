import { randomUUID } from 'crypto';
import { buildCodingQuestionPayload } from '@/lib/coding/coding-bank-persist';
import { dbRowTimestamps } from '@/lib/db/row-timestamps';
import {
  isFacultyCodingQuestion,
  type FacultyCodingQuestion,
} from '@/lib/exam-builder/programming-syllabus';
import type { FacultyExamQuestion, FacultyMcqQuestion } from '@/lib/faculty-exams';
import { questionTagsFromProMetadata } from '@/lib/exam-v2/subject-progress';

export function examQuestionToDbRow(
  q: FacultyExamQuestion,
  extra?: { testId?: unknown; tags?: string[] },
): Record<string, unknown> {
  const timestamps = dbRowTimestamps();
  if (isFacultyCodingQuestion(q)) {
    return codingQuestionToDbRow(q, extra);
  }
  const mcq = q as FacultyMcqQuestion;
  const proTags = questionTagsFromProMetadata(mcq);
  const row: Record<string, unknown> = {
    id: randomUUID(),
    ...timestamps,
    question_text: mcq.question_text,
    question_type: 'mcq',
    option_a: mcq.option_a,
    option_b: mcq.option_b,
    option_c: mcq.option_c,
    option_d: mcq.option_d,
    correct_answer: mcq.correct_answer,
    explanation: mcq.explanation ?? '',
    marks: 1,
  };
  const tags = [...proTags, ...(extra?.tags ?? [])];
  if (tags.length) row.tags = tags;
  if (extra?.testId !== undefined) row.test_id = extra.testId;
  return row;
}

function codingQuestionToDbRow(
  q: FacultyCodingQuestion,
  extra?: { testId?: unknown; tags?: string[] },
): Record<string, unknown> {
  const lang = q.default_language ?? 'java';
  const payload = buildCodingQuestionPayload(
    {
      id: q.coding_problem_id,
      title: q.title ?? 'Coding problem',
      difficulty: 'Medium',
      statement: q.question_text,
      inputFormat: q.input_format ?? 'See problem statement.',
      outputFormat: q.output_format ?? 'See problem statement.',
      sampleInput: q.sample_input ?? '',
      sampleOutput: q.sample_output ?? '',
      defaultLanguage: lang,
      testCases: q.test_cases?.length
        ? q.test_cases
        : q.sample_input && q.sample_output
          ? [{ input: q.sample_input, expectedOutput: q.sample_output }]
          : [],
    },
    lang,
  );
  const proTags = questionTagsFromProMetadata(q);
  const row: Record<string, unknown> = {
    id: randomUUID(),
    ...dbRowTimestamps(),
    question_text: payload.questionText,
    question_type: 'coding',
    type: 'CODING',
    difficulty: payload.difficulty,
    correct_answer: payload.correctAnswer,
    explanation: payload.explanation,
    marks: 1,
    tags: [...payload.tags, ...proTags, ...(extra?.tags ?? [])],
  };
  if (extra?.testId !== undefined) row.test_id = extra.testId;
  return row;
}
