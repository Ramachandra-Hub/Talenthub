/** Detect competitive-programming / reference source (not student prose). */
export function looksLikeSourceCode(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 40) return false;
  return /import\s+java|public\s+class\s+\w+|FastScanner|static\s+class\s+\w+|def\s+\w+\(|#include\s*<|using\s+namespace|Scanner\s*\(/.test(
    t,
  );
}

export type RawBankQuestion = {
  id: number | string;
  title: string;
  category: string;
  difficulty: string;
  tags?: string[];
  problem_statement: string;
  input_format: string;
  output_format: string;
  constraints: string[] | string;
  sample_input: string;
  sample_output: string;
  sample_explanation?: string;
  solution?: { language?: string; code?: string } | string;
};

export type BankValidationIssue = {
  level: 'error' | 'warning';
  questionId?: string | number;
  message: string;
};

export type ValidatedBankQuestion = {
  sourceId: number;
  title: string;
  category: string;
  difficultyRaw: string;
  difficulty: 'easy' | 'medium' | 'advanced';
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraintsText: string;
  sampleInput: string;
  sampleOutput: string;
  studentExplanation: string | null;
  javaReference: string | null;
  pythonReference: string | null;
  referenceSolutionStatus: 'missing' | 'needs_validation' | 'validated';
  referenceAuditNotes: string[];
};

function mapDifficulty(raw: string): 'easy' | 'medium' | 'advanced' {
  const v = raw.trim().toLowerCase();
  if (v === 'easy') return 'easy';
  if (v === 'medium' || v === 'easy-medium' || v === 'easy/medium') return 'medium';
  if (v.includes('hard') || v === 'advanced') return 'advanced';
  return 'medium';
}

function constraintsToText(c: string[] | string): string {
  if (Array.isArray(c)) return c.map((line) => `• ${line}`).join('\n');
  return String(c ?? '').trim();
}

/**
 * Audit Java reference suitability under stated constraints.
 * Does NOT invent solutions — only flags risk for admin validation.
 */
export function auditJavaReference(
  javaCode: string | null,
  constraintsText: string,
): { status: 'missing' | 'needs_validation' | 'validated'; notes: string[] } {
  if (!javaCode) {
    return { status: 'missing', notes: ['No Java reference solution found in bank.'] };
  }
  const notes: string[] = [];
  const usesDfsRecursion = /static\s+long\s+dfs\s*\(|dfs\s*\(/.test(javaCode);
  const highN = /N\s*<=\s*1000|2\s*<=\s*N\s*<=\s*1000/i.test(constraintsText);
  const highQ = /Q\s*<=\s*3000|1\s*<=\s*Q\s*<=\s*3000/i.test(constraintsText);

  if (usesDfsRecursion && highN) {
    notes.push(
      'Recursive DFS with N up to 1000 may hit JVM stack limits; needs admin validation before use as an oracle.',
    );
  }
  if (usesDfsRecursion && highN && highQ) {
    notes.push(
      'Per-query DFS is O(N·Q) (~3e6) which may be acceptable for wall-clock but is not proven production-safe.',
    );
  }
  if (!/class\s+Main/.test(javaCode) && !/public\s+class\s+\w+/.test(javaCode)) {
    notes.push('Reference Java lacks a clear Main/public class entrypoint.');
  }

  if (notes.length) {
    return { status: 'needs_validation', notes };
  }
  return {
    status: 'needs_validation',
    notes: ['Java reference present but not independently proven against full constraint suite.'],
  };
}

export function classifyBankFields(q: RawBankQuestion): {
  studentExplanation: string | null;
  javaReference: string | null;
  pythonReference: string | null;
} {
  const expl = typeof q.sample_explanation === 'string' ? q.sample_explanation.trim() : '';
  const solRaw = q.solution;
  const solCode =
    typeof solRaw === 'string'
      ? solRaw.trim()
      : typeof solRaw?.code === 'string'
        ? solRaw.code.trim()
        : '';

  let javaReference: string | null = null;
  let studentExplanation: string | null = null;

  if (looksLikeSourceCode(expl)) {
    javaReference = expl;
  } else if (expl) {
    studentExplanation = expl;
  }

  if (looksLikeSourceCode(solCode)) {
    javaReference = javaReference ?? solCode;
  } else if (solCode && !studentExplanation) {
    studentExplanation = solCode;
  }

  return { studentExplanation, javaReference, pythonReference: null };
}

export function validateQuestionBank(raw: unknown): {
  ok: boolean;
  issues: BankValidationIssue[];
  questions: ValidatedBankQuestion[];
} {
  const issues: BankValidationIssue[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, issues: [{ level: 'error', message: 'Bank root must be an object' }], questions: [] };
  }
  const root = raw as Record<string, unknown>;
  const list = root.questions;
  if (!Array.isArray(list)) {
    return {
      ok: false,
      issues: [{ level: 'error', message: 'Bank must contain a questions array' }],
      questions: [],
    };
  }
  if (list.length !== 50) {
    issues.push({
      level: 'error',
      message: `Expected 50 questions, found ${list.length}`,
    });
  }

  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const questions: ValidatedBankQuestion[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      issues.push({ level: 'error', message: 'Question entry is not an object' });
      continue;
    }
    const q = item as RawBankQuestion;
    const sourceId = Number(q.id);
    if (!Number.isFinite(sourceId)) {
      issues.push({ level: 'error', message: 'Question missing numeric id' });
      continue;
    }
    const idKey = String(sourceId);
    if (seenIds.has(idKey)) {
      issues.push({ level: 'error', questionId: sourceId, message: `Duplicate id ${sourceId}` });
    }
    seenIds.add(idKey);

    const title = String(q.title ?? '').trim();
    if (!title) {
      issues.push({ level: 'error', questionId: sourceId, message: 'Missing title' });
    } else if (seenTitles.has(title.toLowerCase())) {
      issues.push({ level: 'error', questionId: sourceId, message: `Duplicate title "${title}"` });
    }
    seenTitles.add(title.toLowerCase());

    const required: Array<[string, unknown]> = [
      ['category', q.category],
      ['difficulty', q.difficulty],
      ['problem_statement', q.problem_statement],
      ['input_format', q.input_format],
      ['output_format', q.output_format],
      ['constraints', q.constraints],
      ['sample_input', q.sample_input],
      ['sample_output', q.sample_output],
    ];
    for (const [name, val] of required) {
      const empty =
        val == null ||
        (typeof val === 'string' && !val.trim()) ||
        (Array.isArray(val) && val.length === 0);
      if (empty) {
        issues.push({
          level: 'error',
          questionId: sourceId,
          message: `Missing ${name}`,
        });
      }
    }

    if (q.solution == null) {
      issues.push({
        level: 'warning',
        questionId: sourceId,
        message: 'Missing solution field (admin-only)',
      });
    }

    const constraintsText = constraintsToText(q.constraints);
    const classified = classifyBankFields(q);
    const audit = auditJavaReference(classified.javaReference, constraintsText);

    if (!classified.javaReference && !classified.studentExplanation) {
      issues.push({
        level: 'warning',
        questionId: sourceId,
        message: 'No usable solution/explanation fields after classification',
      });
    }

    questions.push({
      sourceId,
      title,
      category: String(q.category ?? '').trim(),
      difficultyRaw: String(q.difficulty ?? '').trim(),
      difficulty: mapDifficulty(String(q.difficulty ?? 'medium')),
      tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
      statement: String(q.problem_statement ?? '').trim(),
      inputFormat: String(q.input_format ?? '').trim(),
      outputFormat: String(q.output_format ?? '').trim(),
      constraintsText,
      sampleInput: String(q.sample_input ?? ''),
      sampleOutput: String(q.sample_output ?? '').trim(),
      studentExplanation: classified.studentExplanation,
      javaReference: classified.javaReference,
      pythonReference: classified.pythonReference,
      referenceSolutionStatus: audit.status,
      referenceAuditNotes: audit.notes,
    });
  }

  const ok = !issues.some((i) => i.level === 'error');
  return { ok, issues, questions };
}
