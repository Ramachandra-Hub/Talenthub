import { parseStoredCodingProblem } from '@/lib/coding/coding-bank-persist';
import type { Question, Test } from '@/lib/types';

function rowString(
  row: Record<string, unknown>,
  snake: string,
  camel?: string,
): string | null {
  const raw = row[snake] ?? (camel ? row[camel] : undefined);
  if (raw == null) return null;
  return String(raw);
}

function looksLikeCodingType(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'coding';
}

/** Compare stored correct key (often A/B/C/D) with what the UI captured. */
export function answersMatchMcq(user: unknown, correct: unknown): boolean {
  const u = String(user ?? '').trim().toUpperCase();
  const e = String(correct ?? '').trim().toUpperCase();
  if (u === e) return true;
  const u1 = u.charAt(0);
  const e1 = e.charAt(0);
  if (/^[ABCD]$/.test(u1) && /^[ABCD]$/.test(e1)) return u1 === e1;
  return false;
}

/** Map AWS RDS `tests` rows (legacy column names) to UI `Test` shape */
export function adaptTestRow(row: Record<string, unknown>): Test {
  const title = (row.title as string | undefined) ?? (row.name as string | undefined) ?? 'Practice test';
  const durationMinutes = Number(
    row.duration_minutes ?? row.duration ?? 60
  );
  const difficulty = (row.difficulty ?? row.difficulty_level ?? 'medium') as
    | 'easy'
    | 'medium'
    | 'hard';

  const qLimit = row.question_time_limit_sec ?? row.question_time_seconds;
  const question_time_limit_sec =
    qLimit != null && !Number.isNaN(Number(qLimit)) ? Number(qLimit) : null;

  const catEmbed = row.test_categories as { slug?: string } | { slug?: string }[] | null | undefined;
  let categorySlug: string | undefined;
  if (catEmbed && typeof catEmbed === 'object') {
    if (Array.isArray(catEmbed)) {
      categorySlug = catEmbed[0]?.slug;
    } else {
      categorySlug = catEmbed.slug;
    }
  }

  return {
    id: String(row.id),
    name: title,
    category_id: String(row.category_id ?? ''),
    duration: durationMinutes,
    total_questions: Number(row.total_questions ?? 0),
    passing_score: row.passing_score != null ? Number(row.passing_score) : null,
    description: (row.description as string | undefined) ?? null,
    difficulty_level: difficulty ?? null,
    is_paid: Boolean(row.is_paid ?? false),
    created_at: (row.created_at as string | undefined) ?? new Date().toISOString(),
    updated_at: (row.updated_at as string | undefined) ?? new Date().toISOString(),
    question_time_limit_sec,
    category_slug: categorySlug ?? null,
  };
}

/** Normalize practice questions from DB (option_a … option_d / question_type mcq). */
export function adaptQuestionRow(row: Record<string, unknown>): Question {
  const questionTypeRaw = rowString(row, 'question_type', 'questionType');
  const typeRaw = rowString(row, 'type');
  const explanation = rowString(row, 'explanation');
  const stored = parseStoredCodingProblem(explanation);
  const coding = looksLikeCodingType(questionTypeRaw) || looksLikeCodingType(typeRaw) || Boolean(stored);

  const qa = (questionTypeRaw ?? typeRaw ?? '').toLowerCase();
  let type: Question['type'] = coding
    ? 'coding'
    : qa === 'numeric'
      ? 'numeric'
      : qa === 'verbal'
        ? 'verbal'
        : 'MCQ';

  const optsFromJson = Array.isArray(row.options)
    ? row.options.map(String)
    : null;

  const ans = String(row.correct_answer ?? row.correctAnswer ?? '').trim().toUpperCase();
  const correct_answer = ans.length <= 2 && /^[ABCD]$/.test(ans.slice(0, 1))
    ? ans.slice(0, 1)
    : ans;

  const optionA = row.option_a ?? row.optionA;
  const optionB = row.option_b ?? row.optionB;
  const optionC = row.option_c ?? row.optionC;
  const optionD = row.option_d ?? row.optionD;

  return {
    id: String(row.id),
    category_id: String(row.category_id ?? row.categoryId ?? ''),
    difficulty:
      ((row.difficulty as Question['difficulty'] | undefined) ?? 'medium') as Question['difficulty'],
    question_text: String(row.question_text ?? row.questionText ?? stored?.problem.statement ?? ''),
    type,
    options: optsFromJson,
    correct_answer,
    explanation,
    tags: Array.isArray(row.tags)
      ? (row.tags as string[])
      : null,
    created_at: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
    question_type: coding ? 'coding' : questionTypeRaw ?? undefined,
    option_a:
      typeof optionA === 'string' || optionA == null ? (optionA as string | null) : String(optionA),
    option_b:
      typeof optionB === 'string' || optionB == null ? (optionB as string | null) : String(optionB),
    option_c:
      typeof optionC === 'string' || optionC == null ? (optionC as string | null) : String(optionC),
    option_d:
      typeof optionD === 'string' || optionD == null ? (optionD as string | null) : String(optionD),
    coding_problem_id:
      stored?.problem.id ??
      (typeof row.coding_problem_id === 'string' ? row.coding_problem_id : null),
    coding_title: stored?.problem.title ?? (typeof row.title === 'string' ? row.title : null),
    coding_sample_input: stored?.problem.sampleInput ?? rowString(row, 'sample_input', 'sampleInput'),
    coding_sample_output: stored?.problem.sampleOutput ?? rowString(row, 'sample_output', 'sampleOutput'),
    coding_input_format: stored?.problem.inputFormat ?? rowString(row, 'input_format', 'inputFormat'),
    coding_output_format: stored?.problem.outputFormat ?? rowString(row, 'output_format', 'outputFormat'),
    coding_hint: null,
    coding_starter_code: null,
    coding_default_language: stored?.defaultLanguage ?? rowString(row, 'default_language', 'defaultLanguage'),
    coding_test_cases: stored?.problem.testCases ?? null,
  };
}

export function isCodingQuestion(question: {
  type?: string;
  question_type?: string;
  coding_problem_id?: string | null;
}): boolean {
  return (
    looksLikeCodingType(question.type) ||
    looksLikeCodingType(question.question_type) ||
    Boolean(question.coding_problem_id)
  );
}

/** Row from `test_questions` select with `question:questions(*)`. */
export function extractJoinedQuestion(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const nested = (row as { question?: unknown }).question;
  if (Array.isArray(nested)) {
    const first = nested[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  if (nested && typeof nested === 'object') return nested as Record<string, unknown>;
  return null;
}
