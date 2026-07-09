import type {
  PlacementDepartment,
  PlacementSectionConfig,
  PlacementSectionId,
  PlacementTechnicalFormat,
  SpeakingTask,
} from '@/lib/placement/types';

export const TECHNICAL_MCQ_COUNT = 20;
export const TECHNICAL_CODING_COUNT = 3;

import {
  ELEVATEX_EXAM_NAME,
  ELEVATEX_TAGLINE,
} from '@/lib/elevatex';

export const PLACEMENT_EXAM_NAME = ELEVATEX_EXAM_NAME;
export const PLACEMENT_EXAM_TAGLINE = ELEVATEX_TAGLINE;
export const PLACEMENT_TOTAL_MARKS = 100;
export const PLACEMENT_TOTAL_SEC = 60 * 60; // 1 hour

export const PLACEMENT_SECTIONS: PlacementSectionConfig[] = [
  {
    id: 'technical',
    name: 'C Language Assessment (MCQs)',
    short: 'C Language',
    description:
      '20 multiple-choice questions on C programming fundamentals — variables, operators, control flow, functions, arrays, strings, pointers, structures, and file handling.',
    icon: '🛠️',
    kind: 'technical',
    marks: 20,
    durationSec: 20 * 60,
    questionCount: TECHNICAL_MCQ_COUNT,
  },
  {
    id: 'speaking',
    name: 'Speaking / Communication Skills',
    short: 'Speaking',
    description:
      'Verbal ability, comprehension, and expression — five recorded prompts (15 marks total).',
    icon: '🎙️',
    kind: 'speaking',
    marks: 15,
    durationSec: 8 * 60,
  },
  {
    id: 'psychometric',
    name: 'Psychometric Assessment',
    short: 'Psychometric',
    description:
      'Personality and behavioural items covering leadership, teamwork, EQ, decision making, and stress handling.',
    icon: '🧠',
    kind: 'mcq',
    marks: 15,
    durationSec: 8 * 60,
    questionCount: 15,
    negativeMarking: 0,
  },
  {
    id: 'aptitude',
    name: 'Aptitude Assessment',
    short: 'Aptitude',
    description:
      'Quantitative aptitude — percentage, profit & loss, time & work, probability, number systems, speed & distance.',
    icon: '📐',
    kind: 'mcq',
    marks: 20,
    durationSec: 12 * 60,
    questionCount: 20,
    negativeMarking: 0.25,
  },
  {
    id: 'logic',
    name: 'Logic Building',
    short: 'Logic',
    description:
      'Logical reasoning, pattern recognition, critical thinking, analytical reasoning, and puzzles.',
    icon: '🧩',
    kind: 'mcq',
    marks: 15,
    durationSec: 10 * 60,
    questionCount: 15,
    negativeMarking: 0.25,
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    short: 'IQ',
    description:
      'IQ-style observation, memory, sequence, and visual reasoning items.',
    icon: '🔮',
    kind: 'mcq',
    marks: 15,
    durationSec: 10 * 60,
    questionCount: 15,
    negativeMarking: 0,
  },
  {
    id: 'programming',
    name: 'C Language Coding',
    short: 'Coding',
    description:
      'Three C programming problems from the admin-uploaded bank — solve in C using the in-browser compiler.',
    icon: '💻',
    kind: 'coding',
    marks: 20,
    durationSec: 20 * 60,
    questionCount: 3,
  },
];

/** Default ElevateX paper — C language MCQs + programming coding section. */
export function defaultElevateXEnabledSectionIds(): PlacementSectionId[] {
  return ['technical', 'programming'];
}

/** Default placement paper — all classic sections (programming is opt-in). */
export function defaultEnabledPlacementSectionIds(): PlacementSectionId[] {
  return PLACEMENT_SECTIONS.filter((s) => s.id !== 'programming').map((s) => s.id);
}

export function getActivePlacementSections(
  enabledIds?: PlacementSectionId[] | null,
): PlacementSectionConfig[] {
  const set = new Set(enabledIds ?? defaultEnabledPlacementSectionIds());
  return PLACEMENT_SECTIONS.filter((s) => set.has(s.id));
}

export function computePlacementExamTotals(
  sections: PlacementSectionConfig[],
): { totalMarks: number; totalSec: number } {
  return {
    totalMarks: sections.reduce((sum, s) => sum + s.marks, 0),
    totalSec: sections.reduce((sum, s) => sum + s.durationSec, 0),
  };
}

export function getPlacementSection(id: PlacementSectionId): PlacementSectionConfig {
  const found = PLACEMENT_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown placement section: ${id}`);
  return found;
}

/** Built-in departments — aligned with RCEE (rcee.ac.in). */
export const PLACEMENT_DEPARTMENTS: PlacementDepartment[] = [
  { id: 'civil', name: 'Civil Engineering', technicalCategory: 'civil', defaultTechnicalFormat: 'mcq' },
  { id: 'mech', name: 'Mechanical Engineering', technicalCategory: 'mechanical', defaultTechnicalFormat: 'mcq' },
  { id: 'eee', name: 'Electrical & Electronics Engineering', technicalCategory: 'generic', defaultTechnicalFormat: 'mcq' },
  { id: 'ece', name: 'Electronics & Communication Engineering', technicalCategory: 'ece', defaultTechnicalFormat: 'mcq' },
  { id: 'cse', name: 'Computer Science Engineering', technicalCategory: 'cse', defaultTechnicalFormat: 'coding' },
  {
    id: 'cse-cyber',
    name: 'Computer Science Engineering (Cyber Security)',
    technicalCategory: 'cyber',
    defaultTechnicalFormat: 'coding',
  },
  {
    id: 'cse-iot',
    name: 'Computer Science Engineering (Internet of Things)',
    technicalCategory: 'cse',
    defaultTechnicalFormat: 'coding',
  },
  {
    id: 'aids',
    name: 'Artificial Intelligence and Data Science',
    technicalCategory: 'aiml',
    defaultTechnicalFormat: 'coding',
  },
  {
    id: 'aiml',
    name: 'Artificial Intelligence & Machine Learning',
    technicalCategory: 'aiml',
    defaultTechnicalFormat: 'coding',
  },
  {
    id: 'mca',
    name: 'Master of Computer Applications (MCA)',
    technicalCategory: 'cse',
    defaultTechnicalFormat: 'coding',
  },
  { id: 'bba', name: 'Business Administration', technicalCategory: 'generic', defaultTechnicalFormat: 'mcq' },
];

export function defaultTechnicalFormatForDepartment(departmentId: string): PlacementTechnicalFormat {
  return findDepartment(departmentId)?.defaultTechnicalFormat ?? 'mcq';
}

export function technicalDurationSec(format: PlacementTechnicalFormat): number {
  if (format === 'both') return 30 * 60;
  return 20 * 60;
}

export function technicalMarkSplit(format: PlacementTechnicalFormat): {
  mcq: number;
  coding: number;
} {
  switch (format) {
    case 'mcq':
      return { mcq: 20, coding: 0 };
    case 'coding':
      return { mcq: 0, coding: 20 };
    case 'both':
      return { mcq: 10, coding: 10 };
  }
}

export function describeTechnicalSection(
  format: PlacementTechnicalFormat,
  departmentName: string,
): string {
  void departmentName;
  switch (format) {
    case 'mcq':
      return `${TECHNICAL_MCQ_COUNT} C language MCQs (1 mark each) covering fundamentals, control flow, pointers, structures, and file handling.`;
    case 'coding':
      return `Exactly ${TECHNICAL_CODING_COUNT} C programming problems. Solve each in C using the in-browser compiler.`;
    case 'both':
      return `${TECHNICAL_MCQ_COUNT} C language MCQs plus ${TECHNICAL_CODING_COUNT} C programming problems in this section.`;
  }
}

export function technicalSectionSummary(format: PlacementTechnicalFormat): string {
  switch (format) {
    case 'mcq':
      return `${TECHNICAL_MCQ_COUNT} C language MCQs (20 marks)`;
    case 'coding':
      return `${TECHNICAL_CODING_COUNT} C coding problems`;
    case 'both':
      return `${TECHNICAL_MCQ_COUNT} C MCQs + ${TECHNICAL_CODING_COUNT} coding`;
  }
}

export function technicalFormatButtonLabel(format: PlacementTechnicalFormat): string {
  switch (format) {
    case 'mcq':
      return 'MCQs only';
    case 'coding':
      return 'Coding only';
    case 'both':
      return 'MCQ + Coding';
  }
}

export function findDepartment(id: string): PlacementDepartment | null {
  return PLACEMENT_DEPARTMENTS.find((d) => d.id === id) ?? null;
}

export const SPEAKING_TASKS: SpeakingTask[] = [
  {
    id: 'self-intro',
    title: 'Self introduction',
    prompt:
      'Introduce yourself in 60 seconds — name, branch, year, technical interests, one project you are proud of, and a goal for your next placement cycle.',
    recordSec: 60,
    marks: 3,
  },
  {
    id: 'paragraph',
    title: 'Read this paragraph aloud',
    prompt:
      'Speak clearly. Try to maintain a natural pace. The AI will compare the recording to the original text.',
    referenceText:
      'Effective communication is at the heart of every successful engineer. Whether you are explaining a design decision, walking a teammate through a tricky bug, or presenting a project to non-technical stakeholders, the ability to organise your thoughts and convey them with clarity is what separates great engineers from merely good ones.',
    recordSec: 90,
    marks: 4,
  },
  {
    id: 'confidence',
    title: 'Confidence question',
    prompt:
      'Tell us about a moment you struggled at work or in college and how you handled it. Speak naturally for 45 seconds.',
    recordSec: 45,
    marks: 3,
  },
  {
    id: 'summarise',
    title: 'Explain a concept',
    prompt:
      'In about 45 seconds, explain what effective teamwork means in a software project — roles, communication, and delivery.',
    recordSec: 45,
    marks: 3,
  },
  {
    id: 'professional-tone',
    title: 'Professional response',
    prompt:
      'A recruiter asks: "Why should we hire you for an internship?" Respond clearly and professionally in 60 seconds.',
    recordSec: 60,
    marks: 2,
  },
];

/** Hard cap for any single section's timer (defense in depth). */
export const SECTION_TIME_HARD_CAP_SEC = 30 * 60;
