import { formatScorePercent, roundScorePercent } from '@/lib/format-score';
import { buildCodingDeepAnalysis, type CodingDeepAnalysis } from '@/lib/exam-v2/coding-rubric';
import { scoreQuestionsOnServer, type QuestionScoreResult } from '@/lib/exam-v2/server-score';
import { JAVA_TODAY_CODING_MARKS, JAVA_TODAY_EXAM_KIND, JAVA_TODAY_MCQ_MARKS } from '@/lib/exams/java-today-exam';
import { readProSubjectMeta } from '@/lib/exam-v2/subject-progress';
import { EXAM_SCORECARD_ANSWERS_TYPE } from '@/lib/placement/scorecard-payload';
import type { Question } from '@/lib/types';
import type {
  PlacementCandidate,
  PlacementScorecard,
  PlacementSectionScore,
} from '@/lib/placement/types';

export { EXAM_SCORECARD_ANSWERS_TYPE };

function readinessLabel(percent: number): PlacementScorecard['placementReadiness'] {
  if (percent >= 80) return 'Excellent';
  if (percent >= 65) return 'Strong';
  if (percent >= 45) return 'Developing';
  return 'Needs work';
}

function subjectKey(question: Question): { slug: string; name: string } {
  const meta = readProSubjectMeta(question);
  if (meta) return meta;
  if (question.coding_default_language === 'java' || /\bjava\b/i.test(question.question_text)) {
    return { slug: 'java', name: 'Java' };
  }
  if (question.coding_default_language === 'python') {
    return { slug: 'python', name: 'Python' };
  }
  if (question.coding_default_language === 'c') {
    return { slug: 'c-programming', name: 'C Programming' };
  }
  return { slug: 'general', name: 'Exam' };
}

function insightsForSections(
  sections: PlacementSectionScore[],
  codingAnalysis?: CodingDeepAnalysis | null,
): { strengths: string[]; weaknesses: string[]; recommendations: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];
  for (const section of sections) {
    if (section.percent >= 70) strengths.push(`Strong in ${section.name} (${section.percent}%).`);
    else if (section.percent < 40) {
      weaknesses.push(`Needs work in ${section.name} (${section.percent}%).`);
      recommendations.push(`Revise ${section.name} and practise similar questions.`);
    }
  }
  if (codingAnalysis) {
    for (const param of codingAnalysis.aggregate.parameters) {
      const pct = param.maxPoints > 0 ? Math.round((param.earned / param.maxPoints) * 100) : 0;
      if (pct >= 70) strengths.push(`Coding: ${param.label} (${formatScorePercent(param.earned)}/${param.maxPoints}).`);
      else if (pct < 40) {
        weaknesses.push(`Coding: ${param.label} needs improvement (${formatScorePercent(param.earned)}/${param.maxPoints}).`);
        recommendations.push(`Practise ${param.label.toLowerCase()} with similar coding problems.`);
      }
    }
  }
  if (!strengths.length && sections.length) {
    strengths.push('Completed the exam sitting.');
  }
  if (!recommendations.length) {
    recommendations.push('Review missed questions and retry similar problems.');
  }
  return { strengths, weaknesses, recommendations };
}

export function encodeExamScorecardAnswers(
  scorecard: PlacementScorecard,
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    _type: EXAM_SCORECARD_ANSWERS_TYPE,
    scorecard,
  };
}

export async function buildExamScorecard(input: {
  testId: string;
  testName: string;
  answers: Record<string, unknown>;
  candidate: {
    fullName: string;
    hallTicket: string;
    email?: string | null;
    departmentId?: string | null;
    collegeName?: string | null;
  };
  startedAt?: string;
  completedAt?: string;
  elapsedSec?: number;
  /** Skip remote coding grading (fast submit path). */
  deferCoding?: boolean;
  userId?: string;
  attemptRound?: number | null;
}): Promise<{
  scorecard: PlacementScorecard;
  scorePercent: number;
  rawNetScore: number;
  totalQuestions: number;
} | null> {
  const scored = await scoreQuestionsOnServer(input.testId, input.answers, {
    deferCoding: input.deferCoding,
    userId: input.userId,
    attemptRound: input.attemptRound,
  });
  if (!scored) return null;

  const byId = new Map(scored.results.map((row) => [row.questionId, row]));
  const buckets = new Map<string, { name: string; rows: QuestionScoreResult[] }>();

  for (const question of scored.questions) {
    const key = subjectKey(question);
    const bucket = buckets.get(key.slug) ?? { name: key.name, rows: [] };
    const result = byId.get(question.id);
    if (result) bucket.rows.push(result);
    buckets.set(key.slug, bucket);
  }

  const sections: PlacementSectionScore[] = [];
  let earnedMarks = 0;
  let totalMarks = 0;

  if (scored.markScheme?.examKind === JAVA_TODAY_EXAM_KIND) {
    const mcqRows = scored.results.filter((row) => !row.isCoding);
    const codingRowsForMarks = scored.results.filter((row) => row.isCoding);
    const mcqEarned = mcqRows.reduce((sum, row) => sum + row.earned, 0);
    const bestCoding = codingRowsForMarks.length
      ? Math.max(...codingRowsForMarks.map((row) => row.earned))
      : 0;
    const codingEarned = input.deferCoding ? 0 : bestCoding;
    earnedMarks = mcqEarned + codingEarned;
    totalMarks = JAVA_TODAY_MCQ_MARKS + JAVA_TODAY_CODING_MARKS;
    sections.push({
      sectionId: 'technical',
      name: 'Java MCQ',
      marks: JAVA_TODAY_MCQ_MARKS,
      earned: roundScorePercent(mcqEarned),
      percent: roundScorePercent((mcqEarned / JAVA_TODAY_MCQ_MARKS) * 100),
      correct: mcqRows.filter((row) => row.correct).length,
      wrong: mcqRows.filter((row) => row.wrong).length,
      skipped: mcqRows.filter((row) => row.skipped).length,
      total: mcqRows.length,
    });
    sections.push({
      sectionId: 'programming',
      name: 'Java coding (best of 2)',
      marks: JAVA_TODAY_CODING_MARKS,
      earned: roundScorePercent(codingEarned),
      percent: roundScorePercent((codingEarned / JAVA_TODAY_CODING_MARKS) * 100),
      correct: codingRowsForMarks.filter((row) => row.correct).length,
      wrong: codingRowsForMarks.filter((row) => row.wrong).length,
      skipped: codingRowsForMarks.filter((row) => row.skipped).length,
      total: codingRowsForMarks.length,
    });
  } else {
  for (const [slug, bucket] of buckets) {
    const rowsForMarks = input.deferCoding
      ? bucket.rows.filter((row) => !row.isCoding)
      : bucket.rows;
    if (input.deferCoding && rowsForMarks.length === 0 && bucket.rows.every((r) => r.isCoding)) {
      // Keep a coding subject tile visible while remote grading is pending.
      sections.push({
        sectionId: slug as PlacementSectionScore['sectionId'],
        name: bucket.name,
        marks: bucket.rows.length,
        earned: 0,
        percent: 0,
        correct: 0,
        wrong: 0,
        skipped: bucket.rows.filter((row) => row.skipped).length,
        total: bucket.rows.length,
      });
      continue;
    }
    const marks = rowsForMarks.length || bucket.rows.length;
    const earned = rowsForMarks.reduce((sum, row) => sum + row.earned, 0);
    earnedMarks += earned;
    totalMarks += marks;
    sections.push({
      sectionId: slug as PlacementSectionScore['sectionId'],
      name: bucket.name,
      marks,
      earned: roundScorePercent(earned),
      percent: marks > 0 ? roundScorePercent((earned / marks) * 100) : 0,
      correct: rowsForMarks.filter((row) => row.correct).length,
      wrong: rowsForMarks.filter((row) => row.wrong).length,
      skipped: rowsForMarks.filter((row) => row.skipped).length,
      total: marks,
    });
  }
  }

  const percentage =
    totalMarks > 0 ? roundScorePercent((earnedMarks / totalMarks) * 100) : scored.scorePercent;
  const codingRows = scored.results
    .filter((row) => row.isCoding && row.codingRubric)
    .map((row) => ({
      questionId: row.questionId,
      title: row.codingTitle ?? row.questionId,
      rubric: row.codingRubric!,
    }));
  const codingAnalysis = buildCodingDeepAnalysis(codingRows);
  const gradingPending = Boolean(
    input.deferCoding && scored.results.some((row) => row.isCoding),
  );
  const nowIso = new Date().toISOString();
  const candidate: PlacementCandidate = {
    fullName: input.candidate.fullName,
    hallTicket: input.candidate.hallTicket,
    email: input.candidate.email ?? null,
    departmentId: input.candidate.departmentId || 'generic',
    collegeName: input.candidate.collegeName ?? null,
    examName: input.testName,
    startedAt: input.startedAt ?? nowIso,
    seed: input.testId,
    technicalFormat: 'both',
    examTotalMarks: totalMarks,
  };
  const { strengths, weaknesses, recommendations } = insightsForSections(sections, codingAnalysis);

  const scorecard: PlacementScorecard = {
    candidate,
    startedAt: candidate.startedAt,
    completedAt: input.completedAt ?? nowIso,
    totalElapsedSec: input.elapsedSec ?? 0,
    totalMarks,
    earnedMarks: roundScorePercent(earnedMarks),
    percentage,
    employabilityScore: percentage,
    technicalRating: percentage,
    communicationRating: 0,
    placementReadiness: readinessLabel(percentage),
    sections,
    strengths,
    weaknesses,
    recommendations,
    reportKind: 'exam',
    codingAnalysis,
    gradingPending: gradingPending || undefined,
  };

  return {
    scorecard,
    scorePercent: percentage,
    rawNetScore: earnedMarks,
    totalQuestions: scored.totalQuestions,
  };
}
