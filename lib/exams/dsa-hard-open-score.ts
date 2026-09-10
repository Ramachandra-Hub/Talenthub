import {
  buildCodingDeepAnalysis,
  computeCodingRubric,
  type CodingDeepAnalysis,
  type CodingRubricReport,
} from '@/lib/exam-v2/coding-rubric';
import { DSA_HARD_OPEN_POINTS } from '@/lib/exams/dsa-hard-open-constants';

/** Test cases drive most of the mark; quality params still award partial credit. */
const TEST_WEIGHT = 0.7;
const QUALITY_WEIGHT = 0.3;

export function scoreHardOpenProblem(input: {
  passed: number;
  total: number;
  compileOk: boolean;
  sourceCode: string;
  runtimeMs?: number;
  stderr?: string;
}): {
  points: number;
  scorePercent: number;
  status: 'passed' | 'failed';
  rubric: CodingRubricReport;
  passRatio: number;
} {
  const total = Math.max(0, input.total);
  const passed = Math.max(0, Math.min(input.passed, total || input.passed));
  const passRatio = total > 0 ? passed / total : 0;
  const hadCompileError = !input.compileOk && /error:|cannot find symbol|compilation/i.test(input.stderr ?? '');
  const hadRuntimeError =
    !input.compileOk || /exception in thread|runtimeerror|traceback/i.test(input.stderr ?? '');

  const rubric = computeCodingRubric({
    passed,
    total: Math.max(total, 1),
    compileOk: input.compileOk,
    sourceCode: input.sourceCode,
    hadCompileError,
    hadRuntimeError,
    maxRuntimeMs: input.runtimeMs,
  });

  const qualityMax = rubric.parameters
    .filter((p) => p.id !== 'testCaseAccuracy')
    .reduce((sum, p) => sum + p.maxPoints, 0);
  const qualityEarned = rubric.parameters
    .filter((p) => p.id !== 'testCaseAccuracy')
    .reduce((sum, p) => sum + p.earned, 0);
  const qualityRatio = qualityMax > 0 ? qualityEarned / qualityMax : 0;

  // Priority 1: passed tests. Priority 2: code quality / other rubric params.
  let blended = passRatio * TEST_WEIGHT + qualityRatio * QUALITY_WEIGHT;
  if (passRatio >= 1) {
    blended = Math.max(blended, 1);
  }
  // Empty / nonsense submissions stay near zero.
  if (!input.sourceCode.trim()) {
    blended = 0;
  }

  const scorePercent = Math.round(blended * 10000) / 100;
  const points = Math.round((scorePercent / 100) * DSA_HARD_OPEN_POINTS);
  const status: 'passed' | 'failed' = total > 0 && passed === total ? 'passed' : 'failed';

  return { points, scorePercent, status, rubric, passRatio };
}

export function buildHardOpenCodingAnalysis(
  rows: Array<{ questionId: string; title: string; rubric?: CodingRubricReport | null }>,
): CodingDeepAnalysis | null {
  const withRubric = rows.filter((r) => r.rubric) as Array<{
    questionId: string;
    title: string;
    rubric: CodingRubricReport;
  }>;
  return buildCodingDeepAnalysis(withRubric);
}
