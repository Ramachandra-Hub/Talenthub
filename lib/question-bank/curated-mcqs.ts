import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { allSyllabusUnits } from '@/lib/exam-builder/syllabus';
import { C_LANGUAGE_MCQS } from '@/lib/placement/c-language-mcq-bank';

export type SyllabusTagDef = { slug: string; name: string };

/** @deprecated Use allSyllabusUnits() — kept for imports. */
export const RMSET_EXTRA_TAGS: SyllabusTagDef[] = allSyllabusUnits().filter((u) =>
  [
    'quantitative-aptitude',
    'logical-reasoning',
    'verbal-ability',
    'english-grammar',
    'computer-science',
    'dsa',
    'dbms',
    'operating-systems',
    'electronics',
    'mechanical',
  ].includes(u.slug),
);

export function allSyllabusTagDefs(): SyllabusTagDef[] {
  return allSyllabusUnits();
}

export const CURATED_BANK_MARKER = 'curated-bank-v2';

type RawMcq = FacultyExamQuestion;

const BY_SLUG: Partial<Record<string, RawMcq[]>> = {
  'aptitude-percentages': [
    {
      question_text: 'What is 20% of 250?',
      option_a: '40',
      option_b: '50',
      option_c: '55',
      option_d: '60',
      correct_answer: 'B',
      explanation: '20% of 250 = 50',
    },
    {
      question_text: 'A number is increased by 25% and then decreased by 20%. Net change is:',
      option_a: '0%',
      option_b: '5% increase',
      option_c: '5% decrease',
      option_d: '10% increase',
      correct_answer: 'A',
      explanation: '1.25 × 0.80 = 1.00',
    },
    {
      question_text: 'If 30% of a number is 72, the number is:',
      option_a: '216',
      option_b: '240',
      option_c: '260',
      option_d: '280',
      correct_answer: 'B',
    },
    {
      question_text: 'Express 3/5 as a percentage.',
      option_a: '55%',
      option_b: '60%',
      option_c: '65%',
      option_d: '75%',
      correct_answer: 'B',
    },
    {
      question_text: 'Population rises from 80,000 to 92,000. Percentage increase?',
      option_a: '12%',
      option_b: '15%',
      option_c: '18%',
      option_d: '20%',
      correct_answer: 'B',
    },
  ],
  'aptitude-profit-loss': [
    {
      question_text: 'Cost price ₹400, selling price ₹500. Profit percent?',
      option_a: '20%',
      option_b: '25%',
      option_c: '30%',
      option_d: '35%',
      correct_answer: 'B',
    },
    {
      question_text: 'Marked price ₹1000, discount 10%. Selling price?',
      option_a: '₹850',
      option_b: '₹900',
      option_c: '₹950',
      option_d: '₹990',
      correct_answer: 'B',
    },
    {
      question_text: 'Sold at 20% loss for ₹800. Cost price?',
      option_a: '₹900',
      option_b: '₹960',
      option_c: '₹1000',
      option_d: '₹1100',
      correct_answer: 'C',
    },
  ],
  'aptitude-time-work': [
    {
      question_text: 'A finishes in 12 days, B in 18 days. Together they need:',
      option_a: '6.4 days',
      option_b: '7.2 days',
      option_c: '8.0 days',
      option_d: '9.6 days',
      correct_answer: 'B',
    },
    {
      question_text: '6 men finish in 10 days. How many days for 10 men?',
      option_a: '4',
      option_b: '6',
      option_c: '8',
      option_d: '12',
      correct_answer: 'B',
    },
  ],
  'aptitude-speed-distance': [
    {
      question_text: 'Speed 60 km/h for 2.5 hours. Distance?',
      option_a: '120 km',
      option_b: '140 km',
      option_c: '150 km',
      option_d: '160 km',
      correct_answer: 'C',
    },
    {
      question_text: 'Train 180 m at 54 km/h crosses a pole in:',
      option_a: '10 s',
      option_b: '12 s',
      option_c: '15 s',
      option_d: '18 s',
      correct_answer: 'B',
    },
  ],
  'technical-c-language': C_LANGUAGE_MCQS.map((item) => ({
    question_text: item.q,
    option_a: item.options[0],
    option_b: item.options[1],
    option_c: item.options[2],
    option_d: item.options[3],
    correct_answer: item.correct,
    explanation: item.explanation,
  })),
  'technical-programming': [
    {
      question_text: 'Keyword for a constant in JavaScript?',
      option_a: 'var',
      option_b: 'let',
      option_c: 'const',
      option_d: 'static',
      correct_answer: 'C',
    },
    {
      question_text: 'Time complexity of binary search?',
      option_a: 'O(n)',
      option_b: 'O(log n)',
      option_c: 'O(n log n)',
      option_d: 'O(1)',
      correct_answer: 'B',
    },
  ],
  'technical-dbms': [
    {
      question_text: 'SQL clause to filter after GROUP BY?',
      option_a: 'WHERE',
      option_b: 'HAVING',
      option_c: 'LIMIT',
      option_d: 'DISTINCT',
      correct_answer: 'B',
    },
  ],
  'verbal-vocabulary': [
    {
      question_text: 'Synonym of "Benevolent":',
      option_a: 'Cruel',
      option_b: 'Kind',
      option_c: 'Lazy',
      option_d: 'Proud',
      correct_answer: 'B',
    },
  ],
  'logical-deduction': [
    {
      question_text: 'All cats are mammals. Some mammals are pets. Valid conclusion?',
      option_a: 'All cats are pets',
      option_b: 'Some cats may be pets',
      option_c: 'No cats are pets',
      option_d: 'All pets are cats',
      correct_answer: 'B',
    },
  ],
};

export function getCuratedBaseMcqsForSlug(slug: string, name: string): RawMcq[] {
  return (
    BY_SLUG[slug] ?? [
      {
        question_text: `Which core idea is central to ${name}?`,
        option_a: 'Foundational principle A',
        option_b: 'Foundational principle B',
        option_c: 'Foundational principle C',
        option_d: 'Foundational principle D',
        correct_answer: 'A',
        explanation: `${CURATED_BANK_MARKER} starter for ${slug}`,
      },
    ]
  );
}
