import { formatScorePercent, roundScorePercent } from '@/lib/format-score';
import { buildCodingDeepAnalysis, type CodingDeepAnalysis } from '@/lib/exam-v2/coding-rubric';
import { scoreQuestionsOnServer, type QuestionScoreResult } from '@/lib/exam-v2/server-score';
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
}): Promise<{
  scorecard: PlacementScorecard;
  scorePercent: number;
  rawNetScore: number;
  totalQuestions: number;
} | null> {
  const scored = await scoreQuestionsOnServer(input.testId, input.answers);
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

  for (const [slug, bucket] of buckets) {
    const marks = bucket.rows.length;
    const earned = bucket.rows.reduce((sum, row) => sum + row.earned, 0);
    earnedMarks += earned;
    totalMarks += marks;
    sections.push({
      sectionId: slug as PlacementSectionScore['sectionId'],
      name: bucket.name,
      marks,
      earned: roundScorePercent(earned),
      percent: marks > 0 ? roundScorePercent((earned / marks) * 100) : 0,
      correct: bucket.rows.filter((row) => row.correct).length,
      wrong: bucket.rows.filter((row) => row.wrong).length,
      skipped: bucket.rows.filter((row) => row.skipped).length,
      total: marks,
    });
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
  };

  return {
    scorecard,
    scorePercent: percentage,
    rawNetScore: earnedMarks,
    totalQuestions: scored.totalQuestions,
  };
}
