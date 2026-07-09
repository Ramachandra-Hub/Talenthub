import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import type { CodingLanguageId } from '@/lib/coding/languages';
import { forkRng } from '@/lib/competitive-exam/seed-rng';

export type CodingUploadRow = {
  title: string;
  statement: string;
  sampleInput: string;
  sampleOutput: string;
  inputFormat?: string;
  outputFormat?: string;
  difficulty?: 'Easy' | 'Medium';
  defaultLanguage?: CodingLanguageId;
  hint?: string;
  testCases?: Array<{ input: string; expectedOutput: string; explanation?: string }>;
};

export const CODING_UPLOAD_FORMAT_HINT = `JSON array of coding problems, e.g.:
[
  {
    "title": "Sum of two numbers",
    "statement": "Read A and B, print A+B.",
    "sampleInput": "4 7",
    "sampleOutput": "11",
    "defaultLanguage": "c",
    "testCases": [
      { "input": "4 7", "expectedOutput": "11" },
      { "input": "0 0", "expectedOutput": "0" }
    ]
  }
]

CSV columns (header row required):
title,statement,sample_input,sample_output,difficulty,default_language,hint,test_cases_json`;

function slugId(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `upload-${base || 'problem'}-${index + 1}`;
}

function parseTestCasesJson(raw: string | undefined): CodingUploadRow['testCases'] {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const input = String(r.input ?? '').trim();
        const expectedOutput = String(r.expectedOutput ?? r.expected_output ?? '').trim();
        if (!input || !expectedOutput) return null;
        return {
          input,
          expectedOutput,
          explanation: typeof r.explanation === 'string' ? r.explanation : undefined,
        };
      })
      .filter(Boolean) as NonNullable<CodingUploadRow['testCases']>;
  } catch {
    return undefined;
  }
}

function rowToProblem(row: CodingUploadRow, index: number): ProgrammingProblem | null {
  const title = row.title?.trim();
  const statement = row.statement?.trim();
  const sampleInput = row.sampleInput?.trim();
  const sampleOutput = row.sampleOutput?.trim();
  if (!title || !statement || !sampleInput || !sampleOutput) return null;

  const testCases =
    row.testCases?.length && row.testCases.every((t) => t.input && t.expectedOutput)
      ? row.testCases
      : [{ input: sampleInput, expectedOutput: sampleOutput }];

  const lang = row.defaultLanguage === 'python' ? 'python' : row.defaultLanguage === 'c' ? 'c' : undefined;

  return {
    id: slugId(title, index),
    title,
    difficulty: row.difficulty === 'Medium' ? 'Medium' : 'Easy',
    statement,
    inputFormat: row.inputFormat?.trim() || 'See problem statement.',
    outputFormat: row.outputFormat?.trim() || 'See problem statement.',
    sampleInput,
    sampleOutput,
    hint:
      row.hint?.trim() ||
      (lang === 'c'
        ? 'Use scanf/printf. Example: scanf("%d", &n);'
        : 'Use input() and print().'),
    studentGuide: lang === 'c' ? 'Write a complete C program with main().' : undefined,
    examPurpose: 'Programming fundamentals',
    testCases,
  };
}

export function parseCodingProblemsJson(
  text: string,
): { problems: ProgrammingProblem[]; warnings: string[] } {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problems: [], warnings: ['Invalid JSON — use an array of problem objects.'] };
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const problems: ProgrammingProblem[] = [];

  rows.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      warnings.push(`Row ${index + 1}: skipped (not an object).`);
      return;
    }
    const r = item as Record<string, unknown>;
    const problem = rowToProblem(
      {
        title: String(r.title ?? ''),
        statement: String(r.statement ?? r.description ?? ''),
        sampleInput: String(r.sampleInput ?? r.sample_input ?? ''),
        sampleOutput: String(r.sampleOutput ?? r.sample_output ?? ''),
        inputFormat: typeof r.inputFormat === 'string' ? r.inputFormat : undefined,
        outputFormat: typeof r.outputFormat === 'string' ? r.outputFormat : undefined,
        difficulty: r.difficulty === 'Medium' ? 'Medium' : 'Easy',
        defaultLanguage:
          r.defaultLanguage === 'python' || r.default_language === 'python'
            ? 'python'
            : r.defaultLanguage === 'c' || r.default_language === 'c'
              ? 'c'
              : undefined,
        hint: typeof r.hint === 'string' ? r.hint : undefined,
        testCases: Array.isArray(r.testCases)
          ? (r.testCases as CodingUploadRow['testCases'])
          : parseTestCasesJson(String(r.test_cases_json ?? r.testCasesJson ?? '')),
      },
      index,
    );
    if (!problem) {
      warnings.push(`Row ${index + 1}: missing title, statement, or sample I/O.`);
      return;
    }
    problems.push(problem);
  });

  return { problems, warnings };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCodingProblemsCsv(
  text: string,
): { problems: ProgrammingProblem[]; warnings: string[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { problems: [], warnings: ['CSV needs a header row and at least one data row.'] };
  }

  const headers = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = (name: string) => headers.indexOf(name);

  const problems: ProgrammingProblem[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]!);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cols[j]?.trim() ?? '' : '';
    };
    const problem = rowToProblem(
      {
        title: get('title'),
        statement: get('statement'),
        sampleInput: get('sample_input'),
        sampleOutput: get('sample_output'),
        inputFormat: get('input_format') || undefined,
        outputFormat: get('output_format') || undefined,
        difficulty: get('difficulty') === 'Medium' ? 'Medium' : 'Easy',
        defaultLanguage:
          get('default_language') === 'python'
            ? 'python'
            : get('default_language') === 'c'
              ? 'c'
              : undefined,
        hint: get('hint') || undefined,
        testCases: parseTestCasesJson(get('test_cases_json')),
      },
      i - 1,
    );
    if (!problem) {
      warnings.push(`CSV line ${i + 1}: missing required fields.`);
      continue;
    }
    problems.push(problem);
  }

  return { problems, warnings };
}

/** Pick N unique problems from uploaded bank (deterministic per student seed). */
export function pickProgrammingProblemsForExam(
  seed: string,
  problems: ProgrammingProblem[],
  count: number,
): ProgrammingProblem[] {
  if (!problems.length || count <= 0) return [];
  const rng = forkRng(seed, 'elevatex-programming-pick');
  const pool = [...problems];
  const picked: ProgrammingProblem[] = [];
  while (picked.length < count && pool.length) {
    const i = Math.floor(rng() * pool.length);
    const [item] = pool.splice(i, 1);
    if (item) picked.push({ ...item, id: `placement-prog-${picked.length + 1}` });
  }
  return picked;
}
