import { executeCode } from '@/lib/coding/execute';
import { effectiveSourceCode } from '@/lib/coding/effective-source';
import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import { pickBestLanguageForProblem } from '@/lib/coding/grade-helpers';
import {
  PROGRAMMING_SAMPLE_PROBLEMS,
  outputsMatch,
  type ProgrammingProblem,
} from '@/lib/coding/sample-problems';
import { roundScorePercent } from '@/lib/format-score';

type ProgrammingAnswerRow = {
  userAnswer?: string | null;
};

function parseStoredCode(raw: string | null | undefined): Record<CodingLanguageId, string> {
  if (!raw?.trim()) return {} as Record<CodingLanguageId, string>;
  try {
    return JSON.parse(raw) as Record<CodingLanguageId, string>;
  } catch {
    return {} as Record<CodingLanguageId, string>;
  }
}

async function gradeProgrammingProblem(
  problem: ProgrammingProblem,
  sourcesByLang: Record<CodingLanguageId, string | undefined>,
  fallbackLang: CodingLanguageId,
): Promise<boolean> {
  const gradingLang = pickBestLanguageForProblem(sourcesByLang, fallbackLang);
  const source = effectiveSourceCode(sourcesByLang[gradingLang], gradingLang);
  try {
    const result = await executeCode(gradingLang, source, problem.sampleInput);
    const actual = (result.stdout ?? '').trim();
    return result.exitCode === 0 && outputsMatch(actual, problem.sampleOutput);
  } catch {
    return false;
  }
}

/** Authoritative programming-exam score from submitted code payloads. */
export async function computeProgrammingExamScorePercent(
  answers: Record<string, unknown>,
): Promise<{ scorePercent: number; rawNetScore: number; totalQuestions: number }> {
  const problems = PROGRAMMING_SAMPLE_PROBLEMS;
  let passed = 0;

  await Promise.all(
    problems.map(async (problem) => {
      const row = answers[problem.id] as ProgrammingAnswerRow | undefined;
      const sourcesByLang = parseStoredCode(
        typeof row?.userAnswer === 'string' ? row.userAnswer : null,
      );
      const ok = await gradeProgrammingProblem(
        problem,
        sourcesByLang,
        getCodingLanguage('python').id,
      );
      if (ok) passed += 1;
    }),
  );

  const total = problems.length;
  const scorePercent = total > 0 ? roundScorePercent((passed / total) * 100) : 0;
  return { scorePercent, rawNetScore: passed, totalQuestions: total };
}
