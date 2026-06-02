import type { Question } from '@/lib/types';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import type { CodingLanguageId } from '@/lib/coding/languages';

export type PlacementSectionId =
  | 'technical'
  | 'speaking'
  | 'psychometric'
  | 'aptitude'
  | 'logic'
  | 'intelligence';

export type PlacementSectionKind = 'mcq' | 'speaking' | 'coding';

export type PlacementSectionConfig = {
  id: PlacementSectionId;
  name: string;
  short: string;
  description: string;
  icon: string;
  kind: PlacementSectionKind;
  marks: number;
  durationSec: number;
  /** How many MCQs to draw when section is MCQ-based. */
  questionCount?: number;
  /** Optional negative marking (0 = none). */
  negativeMarking?: number;
};

export type PlacementDepartment = {
  id: string;
  name: string;
  /** Used to bias technical questions. */
  technicalCategory:
    | 'cse'
    | 'ece'
    | 'cyber'
    | 'aiml'
    | 'mechanical'
    | 'civil'
    | 'generic';
};

export type SpeakingTaskId =
  | 'self-intro'
  | 'paragraph'
  | 'confidence'
  | 'summarise'
  | 'professional-tone';

export type SpeakingTask = {
  id: SpeakingTaskId;
  title: string;
  prompt: string;
  /** For reading-aloud tasks. */
  referenceText?: string;
  /** Max seconds per task. */
  recordSec: number;
  marks: number;
};

export type PlacementCandidate = {
  fullName: string;
  hallTicket: string;
  departmentId: string;
  collegeName?: string | null;
  examName?: string | null;
  startedAt: string;
  /** Seed for deterministic question selection. */
  seed: string;
};

export type PlacementMcqAnswerMap = Record<string, string | null>;

export type PlacementSpeakingResponse = {
  taskId: SpeakingTaskId;
  /** Final transcript (Web Speech API or manual fallback). */
  transcript: string;
  /** Total spoken duration in seconds (recording length). */
  durationSec: number;
  /** Word count derived from transcript. */
  wordCount: number;
  /** Heuristic sub-scores 0..100. */
  fluency: number;
  clarity: number;
  grammar: number;
  contentMatch: number;
};

export type PlacementCodingSubmission = {
  problemId: string;
  language: CodingLanguageId;
  sourceCode: string;
  passedCases: number;
  totalCases: number;
  lastRunAt: string;
};

export type PlacementSectionState =
  | { kind: 'mcq'; questions: Question[]; answers: PlacementMcqAnswerMap; completed: boolean }
  | { kind: 'speaking'; responses: PlacementSpeakingResponse[]; completed: boolean }
  | {
      kind: 'coding';
      problems: ProgrammingProblem[];
      submissions: Record<string, PlacementCodingSubmission>;
      completed: boolean;
    };

export type PlacementSession = {
  version: 1;
  candidate: PlacementCandidate;
  sectionStates: Record<PlacementSectionId, PlacementSectionState>;
  /** Index in PLACEMENT_SECTIONS that is currently active. */
  currentSectionIndex: number;
  /** Section-local time remaining (seconds). */
  sectionTimeLeftSec: number;
  /** Global exam time remaining (seconds). */
  globalTimeLeftSec: number;
  submitted: boolean;
};

export type PlacementSectionScore = {
  sectionId: PlacementSectionId;
  name: string;
  marks: number;
  earned: number;
  percent: number;
  correct?: number;
  wrong?: number;
  skipped?: number;
  total?: number;
  /** For speaking section. */
  fluency?: number;
  clarity?: number;
  grammar?: number;
};

export type PlacementScorecard = {
  candidate: PlacementCandidate;
  startedAt: string;
  completedAt: string;
  totalElapsedSec: number;
  totalMarks: number;
  earnedMarks: number;
  percentage: number;
  employabilityScore: number;
  technicalRating: number;
  communicationRating: number;
  placementReadiness: 'Excellent' | 'Strong' | 'Developing' | 'Needs work';
  sections: PlacementSectionScore[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};
