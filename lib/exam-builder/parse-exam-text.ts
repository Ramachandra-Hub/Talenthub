import type { FacultyExamQuestion } from '@/lib/faculty-exams';

export type ParseExamResult = {
  questions: FacultyExamQuestion[];
  warnings: string[];
  /** First ~500 chars of extracted text (for debugging failed uploads). */
  textPreview?: string;
  charsExtracted?: number;
};

const OPTION_LINE_LETTER =
  /^\s*(?:\(?([A-Da-d])\)?|[\(\[]?([A-Da-d])[\)\].:\-–])\s+(.+)$/i;
const OPTION_LINE_NUMBER =
  /^\s*(?:\(?([1-4])\)?|[\(\[]?([1-4])[\)\].:\-–])\s+(.+)$/i;
const ANSWER_LINE =
  /(?:^|\n)\s*(?:answer|ans|correct(?:\s+answer)?|key)\s*[:\-]?\s*([A-Da-d1-4])\b/i;
const QUESTION_NUM_PREFIX =
  /^(?:(?:Q(?:uestion)?\s*)?(\d{1,3})[\.\):\-]\s*|Question\s*(\d{1,3})\s*[\.\):\-]?\s*)/i;

export const MCQ_UPLOAD_FORMAT_HINT = `Supported uploads: .csv (best), .docx, .pdf (text-based, not scanned photos), .txt.

CSV columns: question_text, option_a, option_b, option_c, option_d, correct_answer

PDF/Word layout example:
1. What is 15% of 200?
A) 15
B) 20
C) 30
D) 45
Answer: C

2. Next question…
(or put an Answer Key at the end: 1-C, 2-B, 3-A)`;

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function letterFromOptionMatch(
  letterRaw: string | undefined,
  numberRaw: string | undefined,
): 'A' | 'B' | 'C' | 'D' | null {
  if (letterRaw) {
    const letter = letterRaw.toUpperCase() as 'A' | 'B' | 'C' | 'D';
    if (['A', 'B', 'C', 'D'].includes(letter)) return letter;
  }
  if (numberRaw) {
    const n = Number(numberRaw);
    if (n >= 1 && n <= 4) return ['A', 'B', 'C', 'D'][n - 1] as 'A' | 'B' | 'C' | 'D';
  }
  return null;
}

function extractAnswerKeyMap(text: string): Map<number, 'A' | 'B' | 'C' | 'D'> {
  const map = new Map<number, 'A' | 'B' | 'C' | 'D'>();
  const keyMatch = text.match(
    /(?:^|\n)\s*(?:answer\s*key|answers\s*key|correct\s*answers?|answer\s*sheet)\s*[:\-]?\s*([\s\S]*)$/im,
  );
  const section = keyMatch?.[1] ?? text.slice(Math.max(0, text.length - 2500));

  for (const m of section.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[\.\):\-–]\s*([A-Da-d])\b/gim)) {
    const n = Number(m[1]);
    const letter = m[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
    if (n > 0 && ['A', 'B', 'C', 'D'].includes(letter)) map.set(n, letter);
  }
  for (const m of section.matchAll(/\b(\d{1,3})\s*[-–]\s*([A-Da-d])\b/g)) {
    const n = Number(m[1]);
    const letter = m[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
    if (n > 0 && ['A', 'B', 'C', 'D'].includes(letter)) map.set(n, letter);
  }
  return map;
}

function splitQuestionBlocks(text: string): string[] {
  const splitters = [
    /(?=(?:^|\n)\s*(?:(?:Q(?:uestion)?\s*)?\d{1,3}[\.\):\-]\s+))/im,
    /(?=(?:^|\n)\s*\d{1,3}[\.\)]\s+)/m,
    /(?=(?:^|\n)\s*Question\s+\d{1,3}\s*[\.\):\-]?\s*)/im,
  ];

  for (const re of splitters) {
    const parts = text.split(re).map((p) => p.trim()).filter((p) => p.length > 25);
    if (parts.length >= 1) {
      const parsed = parts.filter((p) => parseBlock(p, new Map()) != null);
      if (parsed.length >= 1) return parts;
    }
  }

  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);
}

function questionNumberFromBlock(block: string): number | null {
  const firstLine = block.split('\n').find((l) => l.trim())?.trim() ?? '';
  const m = firstLine.match(QUESTION_NUM_PREFIX);
  if (!m) return null;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) ? n : null;
}

function parseBlock(
  block: string,
  answerKey: Map<number, 'A' | 'B' | 'C' | 'D'>,
): FacultyExamQuestion | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const first = lines[0].replace(QUESTION_NUM_PREFIX, '').trim();
  const qNum = questionNumberFromBlock(block);

  const options: Partial<Record<'A' | 'B' | 'C' | 'D', string>> = {};
  const questionLines: string[] = first ? [first] : [];
  let correct: 'A' | 'B' | 'C' | 'D' | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    const answerMatch = line.match(ANSWER_LINE);
    if (answerMatch) {
      const raw = answerMatch[1];
      if (/^[1-4]$/.test(raw)) {
        correct = ['A', 'B', 'C', 'D'][Number(raw) - 1] as 'A' | 'B' | 'C' | 'D';
      } else {
        const letter = raw.toUpperCase() as 'A' | 'B' | 'C' | 'D';
        if (['A', 'B', 'C', 'D'].includes(letter)) correct = letter;
      }
      continue;
    }

    const optLetter = line.match(OPTION_LINE_LETTER);
    if (optLetter) {
      const letter = letterFromOptionMatch(optLetter[1] ?? optLetter[2], undefined);
      if (letter) options[letter] = (optLetter[3] ?? '').trim();
      continue;
    }

    const optNumber = line.match(OPTION_LINE_NUMBER);
    if (optNumber) {
      const letter = letterFromOptionMatch(undefined, optNumber[1] ?? optNumber[2]);
      if (letter) options[letter] = (optNumber[3] ?? '').trim();
      continue;
    }

    if (Object.keys(options).length === 0) {
      questionLines.push(line);
    }
  }

  const fullAnswerMatch = block.match(ANSWER_LINE);
  if (!correct && fullAnswerMatch) {
    const raw = fullAnswerMatch[1];
    if (/^[1-4]$/.test(raw)) {
      correct = ['A', 'B', 'C', 'D'][Number(raw) - 1] as 'A' | 'B' | 'C' | 'D';
    } else {
      const letter = raw.toUpperCase() as 'A' | 'B' | 'C' | 'D';
      if (['A', 'B', 'C', 'D'].includes(letter)) correct = letter;
    }
  }

  if (!correct && qNum != null && answerKey.has(qNum)) {
    correct = answerKey.get(qNum) ?? null;
  }

  const question_text = questionLines.join(' ').trim();
  if (!question_text) return null;

  const option_a = options.A ?? '';
  const option_b = options.B ?? '';
  const option_c = options.C ?? '';
  const option_d = options.D ?? '';

  if (!option_a && !option_b && !option_c && !option_d) return null;

  const filled = [option_a, option_b, option_c, option_d].filter(Boolean).length;
  if (filled < 2) return null;

  return {
    question_text,
    option_a: option_a || '—',
    option_b: option_b || '—',
    option_c: option_c || '—',
    option_d: option_d || '—',
    correct_answer: correct ?? 'A',
  };
}

/** Parse MCQ blocks from plain text (PDF / Word / pasted paper). */
export function parseExamTextFromDocument(raw: string): ParseExamResult {
  const warnings: string[] = [];
  const text = normalizeText(raw);
  const charsExtracted = text.length;
  const textPreview = text.slice(0, 500);

  if (charsExtracted < 40) {
    return {
      questions: [],
      warnings: [
        'Almost no text was extracted. Scanned/image-only PDFs do not work — use CSV, or export a searchable PDF / .docx.',
      ],
      textPreview,
      charsExtracted,
    };
  }

  const answerKey = extractAnswerKeyMap(text);
  const blocks = splitQuestionBlocks(text);
  const questions: FacultyExamQuestion[] = [];

  for (const block of blocks) {
    const q = parseBlock(block, answerKey);
    if (q) questions.push(q);
  }

  if (questions.length === 0) {
    warnings.push(
      'No MCQs detected. ' + MCQ_UPLOAD_FORMAT_HINT.split('\n').slice(0, 4).join(' '),
    );
    if (charsExtracted > 200) {
      warnings.push(
        `We read ${charsExtracted.toLocaleString()} characters but could not find numbered questions with A–D options. Try CSV upload or reformat your file.`,
      );
    }
  } else {
    warnings.push(`Parsed ${questions.length} question(s) from document text.`);
    const missingAnswers = questions.filter((q) => {
      if ((q as { question_type?: string }).question_type === 'coding') return false;
      return (q as { correct_answer?: string }).correct_answer === 'A';
    }).length;
    if (answerKey.size > 0) {
      warnings.push(`Applied answer key for ${answerKey.size} numbered item(s).`);
    }
    if (missingAnswers > 0 && !answerKey.size) {
      warnings.push(
        'Some questions had no Answer line — verify correct_answer or add an Answer Key section.',
      );
    }
  }

  return { questions, warnings, textPreview, charsExtracted };
}
