import type {
  PlacementDepartment,
  PlacementSectionConfig,
  PlacementSectionId,
  SpeakingTask,
} from '@/lib/placement/types';

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
    name: 'Technical Assessment',
    short: 'Technical',
    description:
      'Coding-only section with 3 easy practical problems. Write and run code in the compiler.',
    icon: '🛠️',
    kind: 'coding',
    marks: 20,
    durationSec: 20 * 60,
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
];

export function getPlacementSection(id: PlacementSectionId): PlacementSectionConfig {
  const found = PLACEMENT_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown placement section: ${id}`);
  return found;
}

/** Built-in departments — aligned with RCEE (rcee.ac.in). */
export const PLACEMENT_DEPARTMENTS: PlacementDepartment[] = [
  { id: 'civil', name: 'Civil Engineering', technicalCategory: 'civil' },
  { id: 'mech', name: 'Mechanical Engineering', technicalCategory: 'mechanical' },
  { id: 'eee', name: 'Electrical & Electronics Engineering', technicalCategory: 'generic' },
  { id: 'ece', name: 'Electronics & Communication Engineering', technicalCategory: 'ece' },
  { id: 'cse', name: 'Computer Science Engineering', technicalCategory: 'cse' },
  {
    id: 'cse-cyber',
    name: 'Computer Science Engineering (Cyber Security)',
    technicalCategory: 'cyber',
  },
  {
    id: 'cse-iot',
    name: 'Computer Science Engineering (Internet of Things)',
    technicalCategory: 'cse',
  },
  {
    id: 'aids',
    name: 'Artificial Intelligence and Data Science',
    technicalCategory: 'aiml',
  },
  {
    id: 'aiml',
    name: 'Artificial Intelligence & Machine Learning',
    technicalCategory: 'aiml',
  },
  { id: 'bba', name: 'Business Administration', technicalCategory: 'generic' },
];

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
