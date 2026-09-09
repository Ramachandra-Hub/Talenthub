import { describe, expect, it } from 'vitest';
import { assertContestPublishable } from '@/lib/dsa/contest/publish-rules';
import {
  auditJavaReference,
  classifyBankFields,
  looksLikeSourceCode,
  validateQuestionBank,
} from '@/lib/dsa/contest/question-bank';
import {
  assertStudentSafeProblemPayload,
  toStudentContestProblemDto,
} from '@/lib/dsa/contest/serialize';
import { buildContestTriples } from '@/lib/dsa/contest/import-bank';
import { CONTEST_PROBLEM_COUNT } from '@/lib/dsa/contest/types';
import { readFileSync } from 'fs';
import path from 'path';

describe('looksLikeSourceCode', () => {
  it('detects Java reference blocks', () => {
    expect(looksLikeSourceCode('import java.util.*;\npublic class Main {}')).toBe(true);
  });
  it('rejects short prose', () => {
    expect(looksLikeSourceCode('The three path answers sum to 21.')).toBe(false);
  });
});

describe('classifyBankFields', () => {
  it('treats sample_explanation code as reference, not student explanation', () => {
    const classified = classifyBankFields({
      id: 1,
      title: 'T',
      category: 'C',
      difficulty: 'Easy',
      problem_statement: 's',
      input_format: 'i',
      output_format: 'o',
      constraints: ['1'],
      sample_input: '1',
      sample_output: '1',
      sample_explanation: 'import java.io.*;\npublic class Main { static class FastScanner {} }',
      solution: { language: 'Java 17', code: 'The path sum is 21.' },
    });
    expect(classified.javaReference).toContain('public class Main');
    expect(classified.studentExplanation).toContain('path sum');
  });
});

describe('validateQuestionBank', () => {
  it('validates the real 50-question bank file (2)', () => {
    const file = path.join(
      process.cwd(),
      'data',
      'exam_portal_questions_with_solutions(2).json',
    );
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    expect(raw.question_count).toBe(50);
    const result = validateQuestionBank(raw);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(50);
    expect(result.questions.every((q) => q.javaReference || q.studentExplanation)).toBe(true);
  });

  it('validates the real 50-question bank file', () => {
    const file = path.join(
      process.cwd(),
      'data',
      'exam_portal_questions_with_solutions.json',
    );
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const result = validateQuestionBank(raw);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(50);
    expect(result.questions.every((q) => q.javaReference || q.studentExplanation)).toBe(true);
  });

  it('flags duplicate ids', () => {
    const raw = {
      questions: [
        baseQ(1, 'A'),
        baseQ(1, 'B'),
      ],
    };
    const result = validateQuestionBank(raw);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /Duplicate id/.test(i.message))).toBe(true);
  });

  it('flags duplicate titles', () => {
    const raw = {
      questions: [baseQ(1, 'Same'), baseQ(2, 'Same')],
    };
    const result = validateQuestionBank(raw);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /Duplicate title/.test(i.message))).toBe(true);
  });

  it('flags malformed / missing statement', () => {
    const q = baseQ(1, 'X');
    q.problem_statement = '';
    const result = validateQuestionBank({ questions: [q] });
    expect(result.ok).toBe(false);
  });
});

describe('student serializer', () => {
  it('never includes referenceSolutionsJson', () => {
    const dto = toStudentContestProblemDto(
      {
        id: 'p1',
        slug: 'slug',
        title: 'Title',
        statement: 'stmt',
        constraints: 'c',
        inputFormat: 'in',
        outputFormat: 'out',
        difficulty: 'medium',
        categoryLabel: 'Cat',
        tagsJson: ['tree'],
        studentExplanation: 'Prose only',
        starterCodeJson: { java: 'class Main {}', python: 'pass' },
        languagesJson: ['java', 'python'],
        testCasesJson: [
          { input: '1', expectedOutput: '1', hidden: false },
          { input: '2', expectedOutput: '2', hidden: true },
        ],
        timeLimitMs: 8000,
        memoryLimitKb: null,
        referenceSolutionsJson: { java: 'SECRET' },
      },
      { position: 1, points: 100 },
    );
    expect(JSON.stringify(dto)).not.toContain('SECRET');
    expect(dto.hiddenTestCount).toBe(1);
    expect(dto.sampleTests).toHaveLength(1);
    expect(() =>
      assertStudentSafeProblemPayload({ ...dto, referenceSolutionsJson: { java: 'x' } }),
    ).toThrow(/Reference solutions leaked/);
  });
});

describe('contest publish rules', () => {
  it('requires exactly 3 problems', () => {
    expect(() => assertContestPublishable(3)).not.toThrow();
    expect(() => assertContestPublishable(2)).toThrow(/exactly 3/);
    expect(() => assertContestPublishable(4)).toThrow(/exactly 3/);
    expect(() => assertContestPublishable(0)).toThrow(/exactly 3/);
  });
});

describe('contest triples', () => {
  it('builds balanced packs of 3 without intra-contest duplicates', () => {
    const ids = Array.from({ length: 50 }, (_, i) => i + 1);
    const triples = buildContestTriples(ids);
    expect(triples).toHaveLength(16);
    const used = triples.flat();
    expect(used).toHaveLength(48);
    expect(new Set(used).size).toBe(48);
    for (const t of triples) {
      expect(t).toHaveLength(CONTEST_PROBLEM_COUNT);
      expect(new Set(t).size).toBe(CONTEST_PROBLEM_COUNT);
    }
    const remaining = ids.filter((id) => !used.includes(id));
    expect(remaining).toEqual([19, 20]);
  });
});

describe('auditJavaReference', () => {
  it('marks recursive DFS under large N as needs_validation', () => {
    const audit = auditJavaReference(
      'static long dfs(int u, int target) { return dfs(u, target); }\npublic class Main {}',
      '2 <= N <= 1000\n1 <= Q <= 3000',
    );
    expect(audit.status).toBe('needs_validation');
  });
});

function baseQ(id: number, title: string) {
  return {
    id,
    title,
    category: 'Weighted Tree Path Queries',
    difficulty: 'Easy',
    tags: ['tree'],
    problem_statement: 'statement',
    input_format: 'input',
    output_format: 'output',
    constraints: ['2 <= N <= 1000'],
    sample_input: '1',
    sample_output: '1',
    sample_explanation: 'import java.io.*;\npublic class Main { static class FastScanner {} }',
    solution: { language: 'Java 17', code: 'Sample sums to 1.' },
  };
}
