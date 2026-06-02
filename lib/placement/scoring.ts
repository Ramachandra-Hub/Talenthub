import { formatScorePercentLabel } from '@/lib/format-score';
import { answersMatchMcq } from '@/lib/practice-mappers';
import type { Question } from '@/lib/types';
import { PLACEMENT_SECTIONS, SPEAKING_TASKS } from '@/lib/placement/config';
import type {
  PlacementCandidate,
  PlacementCodingSubmission,
  PlacementMcqAnswerMap,
  PlacementScorecard,
  PlacementSectionId,
  PlacementSectionScore,
  PlacementSession,
  PlacementSpeakingResponse,
} from '@/lib/placement/types';

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function roundTo(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Per-question grading for an MCQ section, with optional negative marking. */
export function scoreMcqSection(
  questions: Question[],
  answers: PlacementMcqAnswerMap,
  marks: number,
  negativeMarking = 0,
): {
  correct: number;
  wrong: number;
  skipped: number;
  earned: number;
  percent: number;
} {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  for (const q of questions) {
    const ua = answers[q.id];
    if (ua == null || ua === '') {
      skipped += 1;
      continue;
    }
    if (answersMatchMcq(ua, q.correct_answer)) correct += 1;
    else wrong += 1;
  }
  const total = questions.length || 1;
  // Net score in question units, then scale to section marks.
  const netUnits = Math.max(0, correct - wrong * negativeMarking);
  const earned = roundTo((netUnits / total) * marks, 2);
  const percent = roundTo((earned / marks) * 100, 2);
  return { correct, wrong, skipped, earned, percent };
}

export function scoreSpeakingSection(
  responses: PlacementSpeakingResponse[],
  marks: number,
): {
  earned: number;
  percent: number;
  fluency: number;
  clarity: number;
  grammar: number;
} {
  if (!responses.length) {
    return { earned: 0, percent: 0, fluency: 0, clarity: 0, grammar: 0 };
  }

  let totalTaskMarks = 0;
  let earnedTaskMarks = 0;
  let weightedFluency = 0;
  let weightedClarity = 0;
  let weightedGrammar = 0;

  for (const task of SPEAKING_TASKS) {
    totalTaskMarks += task.marks;
    const r = responses.find((row) => row.taskId === task.id);
    if (!r) continue;
    // Composite per-task: fluency 30%, clarity 25%, grammar 25%, content 20%
    const composite =
      r.fluency * 0.3 + r.clarity * 0.25 + r.grammar * 0.25 + r.contentMatch * 0.2;
    earnedTaskMarks += (composite / 100) * task.marks;
    weightedFluency += (r.fluency / 100) * task.marks;
    weightedClarity += (r.clarity / 100) * task.marks;
    weightedGrammar += (r.grammar / 100) * task.marks;
  }

  const earned = clamp(
    roundTo((earnedTaskMarks / Math.max(1, totalTaskMarks)) * marks, 2),
    0,
    marks,
  );
  const percent = roundTo((earned / marks) * 100, 2);

  return {
    earned,
    percent,
    fluency: roundTo((weightedFluency / Math.max(1, totalTaskMarks)) * 100, 2),
    clarity: roundTo((weightedClarity / Math.max(1, totalTaskMarks)) * 100, 2),
    grammar: roundTo((weightedGrammar / Math.max(1, totalTaskMarks)) * 100, 2),
  };
}

export function scoreCodingSection(
  submissions: Record<string, PlacementCodingSubmission>,
  marks: number,
): {
  earned: number;
  percent: number;
  solved: number;
  totalProblems: number;
} {
  const rows = Object.values(submissions);
  if (!rows.length) return { earned: 0, percent: 0, solved: 0, totalProblems: 0 };
  let passed = 0;
  let total = 0;
  let solved = 0;
  for (const row of rows) {
    const rowTotal = Math.max(0, row.totalCases);
    const rowPassed = Math.max(0, Math.min(row.passedCases, rowTotal));
    passed += rowPassed;
    total += rowTotal;
    if (rowTotal > 0 && rowPassed === rowTotal) solved += 1;
  }
  const earned = total > 0 ? roundTo((passed / total) * marks, 2) : 0;
  const percent = marks > 0 ? roundTo((earned / marks) * 100, 2) : 0;
  return { earned, percent, solved, totalProblems: rows.length };
}

function readinessLabel(percent: number): PlacementScorecard['placementReadiness'] {
  if (percent >= 80) return 'Excellent';
  if (percent >= 65) return 'Strong';
  if (percent >= 45) return 'Developing';
  return 'Needs work';
}

function aiInsights(
  sections: PlacementSectionScore[],
  communication: number,
  technical: number,
  overall: number,
): { strengths: string[]; weaknesses: string[]; recommendations: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  for (const s of sections) {
    if (s.percent >= 75) strengths.push(`${s.name}: strong (${formatScorePercentLabel(s.percent)})`);
    else if (s.percent < 50) weaknesses.push(`${s.name}: needs work (${formatScorePercentLabel(s.percent)})`);
  }

  if (technical < 50) {
    recommendations.push(
      'Revisit subject fundamentals for your branch — target two topics per week with scenario-based practice.',
    );
  } else if (technical >= 75) {
    recommendations.push('Technical knowledge is interview-ready — start mock interviews focused on system design and trade-offs.');
  }

  if (communication < 50) {
    recommendations.push(
      'Spend 10 minutes a day reading aloud and recording yourself. Target 130 words per minute with fewer than 3 fillers per minute.',
    );
  } else if (communication >= 75) {
    recommendations.push('Communication is strong — practise structured answers (STAR) to convert skill into placement offers.');
  }

  const aptitude = sections.find((s) => s.sectionId === 'aptitude');
  const logic = sections.find((s) => s.sectionId === 'logic');
  if (aptitude && aptitude.percent < 55) {
    recommendations.push('Build aptitude speed — 20 mixed sums per day across percentages, ratios, time-and-work.');
  }
  if (logic && logic.percent < 55) {
    recommendations.push('Solve a daily puzzle set (5 problems) on series, syllogisms, and seating arrangements.');
  }

  if (overall >= 80) {
    strengths.push('Overall composite is excellent — placement readiness is high.');
  }

  return { strengths, weaknesses, recommendations };
}

export function computePlacementScorecard(
  session: PlacementSession,
  generatedAt: string = new Date().toISOString(),
): PlacementScorecard {
  const sections: PlacementSectionScore[] = [];

  let earnedMarks = 0;
  let totalMarks = 0;
  let technicalRating = 0;
  let communicationRating = 0;

  for (const cfg of PLACEMENT_SECTIONS) {
    totalMarks += cfg.marks;
    const state = session.sectionStates[cfg.id as PlacementSectionId];

    if (cfg.kind === 'mcq' && state?.kind === 'mcq') {
      const res = scoreMcqSection(state.questions, state.answers, cfg.marks, cfg.negativeMarking ?? 0);
      earnedMarks += res.earned;
      const row: PlacementSectionScore = {
        sectionId: cfg.id,
        name: cfg.name,
        marks: cfg.marks,
        earned: res.earned,
        percent: res.percent,
        correct: res.correct,
        wrong: res.wrong,
        skipped: res.skipped,
        total: state.questions.length,
      };
      sections.push(row);
      if (cfg.id === 'technical') technicalRating = res.percent;
    } else if (cfg.kind === 'coding' && state?.kind === 'coding') {
      const res = scoreCodingSection(state.submissions, cfg.marks);
      earnedMarks += res.earned;
      sections.push({
        sectionId: cfg.id,
        name: cfg.name,
        marks: cfg.marks,
        earned: res.earned,
        percent: res.percent,
        correct: res.solved,
        wrong: Math.max(0, res.totalProblems - res.solved),
        total: res.totalProblems,
      });
      if (cfg.id === 'technical') technicalRating = res.percent;
    } else if (cfg.kind === 'speaking' && state?.kind === 'speaking') {
      const res = scoreSpeakingSection(state.responses, cfg.marks);
      earnedMarks += res.earned;
      sections.push({
        sectionId: cfg.id,
        name: cfg.name,
        marks: cfg.marks,
        earned: res.earned,
        percent: res.percent,
        fluency: res.fluency,
        clarity: res.clarity,
        grammar: res.grammar,
      });
      communicationRating = res.percent;
    } else {
      // Section was not attempted at all.
      sections.push({
        sectionId: cfg.id,
        name: cfg.name,
        marks: cfg.marks,
        earned: 0,
        percent: 0,
      });
    }
  }

  earnedMarks = roundTo(earnedMarks, 2);
  const percentage = clamp(roundTo((earnedMarks / Math.max(1, totalMarks)) * 100, 2));

  // Employability = 0.5 × technical + 0.25 × communication + 0.25 × cognitive (aptitude+logic+iq avg)
  const cognitiveSections = sections.filter((s) =>
    (['aptitude', 'logic', 'intelligence'] as PlacementSectionId[]).includes(s.sectionId),
  );
  const cognitive =
    cognitiveSections.reduce((a, s) => a + s.percent, 0) /
    Math.max(1, cognitiveSections.length);

  const employabilityScore = roundTo(
    technicalRating * 0.5 + communicationRating * 0.25 + cognitive * 0.25,
    2,
  );

  const startedAtIso = session.candidate.startedAt;
  const completedAtIso = generatedAt;
  const totalElapsedSec = Math.max(
    0,
    Math.round(
      (new Date(completedAtIso).getTime() - new Date(startedAtIso).getTime()) / 1000,
    ),
  );

  const insights = aiInsights(sections, communicationRating, technicalRating, percentage);

  return {
    candidate: session.candidate,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    totalElapsedSec,
    totalMarks,
    earnedMarks,
    percentage,
    employabilityScore,
    technicalRating: roundTo(technicalRating, 2),
    communicationRating: roundTo(communicationRating, 2),
    placementReadiness: readinessLabel(percentage),
    sections,
    strengths: insights.strengths,
    weaknesses: insights.weaknesses,
    recommendations: insights.recommendations,
  };
}

export function buildCandidate(input: {
  fullName: string;
  hallTicket: string;
  departmentId: string;
  collegeName?: string | null;
  examName?: string | null;
}): PlacementCandidate {
  const startedAt = new Date().toISOString();
  const seedSource = `${input.hallTicket || 'no-ht'}|${input.fullName || 'anon'}|${startedAt}`;
  return {
    fullName: input.fullName.trim() || 'Candidate',
    hallTicket: input.hallTicket.trim() || `gen-${Date.now()}`,
    departmentId: input.departmentId,
    collegeName: input.collegeName ?? null,
    examName: input.examName ?? null,
    startedAt,
    seed: seedSource,
  };
}
