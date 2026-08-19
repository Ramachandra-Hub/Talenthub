/** Nine-parameter coding deep-analysis rubric (total 100). */
export const CODING_RUBRIC_PARAMETERS = [
  { id: 'testCaseAccuracy', label: 'Test Case Accuracy', maxPoints: 35 },
  { id: 'algorithmLogic', label: 'Algorithm & Problem-Solving Logic', maxPoints: 20 },
  { id: 'timeComplexity', label: 'Time Complexity', maxPoints: 10 },
  { id: 'spaceComplexity', label: 'Space Complexity', maxPoints: 5 },
  { id: 'edgeCaseHandling', label: 'Edge Case Handling', maxPoints: 10 },
  { id: 'codeQuality', label: 'Code Quality & Readability', maxPoints: 5 },
  { id: 'runtimeStability', label: 'Runtime & Compilation Stability', maxPoints: 5 },
  { id: 'problemCompletion', label: 'Problem Completion', maxPoints: 5 },
  { id: 'debuggingErrorHandling', label: 'Debugging / Error Handling', maxPoints: 5 },
] as const;

export type CodingRubricParameterId = (typeof CODING_RUBRIC_PARAMETERS)[number]['id'];

export type CodingRubricParameterScore = {
  id: CodingRubricParameterId;
  label: string;
  maxPoints: number;
  earned: number;
};

export type CodingRubricReport = {
  parameters: CodingRubricParameterScore[];
  totalEarned: number;
  totalMax: 100;
};

export type CodingQuestionRubricRow = {
  questionId: string;
  title: string;
  rubric: CodingRubricReport;
};

export type CodingDeepAnalysis = {
  perQuestion: CodingQuestionRubricRow[];
  aggregate: CodingRubricReport;
};

function clampEarned(value: number, max: number): number {
  return Math.round(Math.min(max, Math.max(0, value)) * 10) / 10;
}

export function emptyCodingRubricReport(): CodingRubricReport {
  return {
    parameters: CODING_RUBRIC_PARAMETERS.map((p) => ({ ...p, earned: 0 })),
    totalEarned: 0,
    totalMax: 100,
  };
}

export function computeCodingRubric(input: {
  passed: number;
  total: number;
  compileOk: boolean;
  sourceCode: string;
  hadCompileError: boolean;
  hadRuntimeError: boolean;
  maxRuntimeMs?: number;
}): CodingRubricReport {
  const code = input.sourceCode.trim();
  const hasCode = code.length > 0;
  const passRatio = input.total > 0 ? input.passed / input.total : 0;

  const scores: Record<CodingRubricParameterId, number> = {
    testCaseAccuracy: clampEarned(passRatio * 35, 35),
    algorithmLogic: clampEarned(
      passRatio * 14 +
        (/\b(for|while|if|else|switch|return)\b/.test(code) ? 3 : 0) +
        (/\b(class|public static|void main|Scanner|BufferedReader)\b/.test(code) ? 3 : 0),
      20,
    ),
    timeComplexity: clampEarned(
      passRatio * 6 +
        (input.maxRuntimeMs != null && input.maxRuntimeMs < 3000 && passRatio === 1 ? 4 : 0) +
        (passRatio >= 0.5 && passRatio < 1 ? 2 : 0),
      10,
    ),
    spaceComplexity: clampEarned(
      passRatio * 3 + (/\bnew [A-Za-z]+\[\s*\d{4,}/.test(code) ? 0 : 2),
      5,
    ),
    edgeCaseHandling: clampEarned(input.total > 1 ? passRatio * 10 : passRatio * 7, 10),
    codeQuality: clampEarned(
      (hasCode ? 2 : 0) +
        (/\/\/|\/\*|\*\//.test(code) ? 1 : 0) +
        (code.split('\n').length >= 5 && code.length < 8000 ? 1 : 0) +
        (passRatio > 0 ? 1 : 0),
      5,
    ),
    runtimeStability: clampEarned(
      !hasCode
        ? 0
        : input.hadCompileError
          ? 0
          : input.compileOk
            ? 5
            : input.hadRuntimeError
              ? 1
              : 3,
      5,
    ),
    problemCompletion: clampEarned(
      !hasCode ? 0 : code.length >= 20 ? (passRatio > 0 ? 5 : 3) : 1,
      5,
    ),
    debuggingErrorHandling: clampEarned(
      !hasCode
        ? 0
        : /\btry\b|\bcatch\b/.test(code)
          ? 4
          : input.hadCompileError
            ? 0
            : passRatio > 0
              ? 3
              : 1,
      5,
    ),
  };

  const parameters: CodingRubricParameterScore[] = CODING_RUBRIC_PARAMETERS.map((p) => ({
    ...p,
    earned: scores[p.id],
  }));
  const totalEarned = clampEarned(
    parameters.reduce((sum, row) => sum + row.earned, 0),
    100,
  );
  return { parameters, totalEarned, totalMax: 100 };
}

export function aggregateCodingRubrics(reports: CodingRubricReport[]): CodingRubricReport {
  if (!reports.length) return emptyCodingRubricReport();
  const parameters: CodingRubricParameterScore[] = CODING_RUBRIC_PARAMETERS.map((p, index) => {
    const earned =
      reports.reduce((sum, report) => sum + (report.parameters[index]?.earned ?? 0), 0) /
      reports.length;
    return { ...p, earned: clampEarned(earned, p.maxPoints) };
  });
  const totalEarned = clampEarned(
    parameters.reduce((sum, row) => sum + row.earned, 0),
    100,
  );
  return { parameters, totalEarned, totalMax: 100 };
}

export function buildCodingDeepAnalysis(
  rows: Array<{ questionId: string; title: string; rubric: CodingRubricReport }>,
): CodingDeepAnalysis | null {
  if (!rows.length) return null;
  return {
    perQuestion: rows,
    aggregate: aggregateCodingRubrics(rows.map((row) => row.rubric)),
  };
}

export function codingRubricCsvHeaders(): string[] {
  return CODING_RUBRIC_PARAMETERS.map((p) => p.label);
}

export function codingRubricCsvValues(report: CodingRubricReport | null | undefined): string[] {
  if (!report) return CODING_RUBRIC_PARAMETERS.map(() => '');
  return report.parameters.map((p) => String(p.earned));
}
