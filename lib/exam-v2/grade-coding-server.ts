import { executeCode } from '@/lib/coding/execute';
import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import { outputsMatch } from '@/lib/coding/sample-problems';
import { getProgrammingProblemById } from '@/lib/exam-builder/programming-syllabus';
import type { Question } from '@/lib/types';

function parseCodingPayload(
  raw: string | null | undefined,
): { language: CodingLanguageId; sourceCode: string } | null {
  if (raw == null || String(raw).trim() === '') return null;
  try {
    const parsed = JSON.parse(String(raw)) as { language?: string; sourceCode?: string };
    if (typeof parsed.sourceCode !== 'string') return null;
    const language = getCodingLanguage(parsed.language ?? 'python').id;
    return { language, sourceCode: parsed.sourceCode };
  } catch {
    return null;
  }
}

function sampleCaseForQuestion(question: Question): { input: string; expectedOutput: string } | null {
  const problem = question.coding_problem_id
    ? getProgrammingProblemById(question.coding_problem_id)
    : undefined;
  const input = problem?.sampleInput ?? question.coding_sample_input ?? '';
  const expectedOutput = problem?.sampleOutput ?? question.coding_sample_output ?? '';
  if (!input.trim() || !expectedOutput.trim()) return null;
  return { input, expectedOutput };
}

/** Grade one coding answer against its sample case (server-side, authoritative on submit). */
export async function isCodingAnswerCorrectOnServer(
  question: Question,
  userAnswer: string | null | undefined,
): Promise<boolean> {
  const payload = parseCodingPayload(userAnswer);
  if (!payload?.sourceCode.trim()) return false;

  const sample = sampleCaseForQuestion(question);
  if (!sample) return true;

  try {
    const result = await executeCode(payload.language, payload.sourceCode, sample.input);
    const actual = (result.stdout ?? '').trim();
    return result.exitCode === 0 && outputsMatch(actual, sample.expectedOutput);
  } catch {
    return false;
  }
}
