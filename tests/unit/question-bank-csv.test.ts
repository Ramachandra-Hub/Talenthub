import { describe, expect, it } from 'vitest';
import { parseMcqCsv } from '@/lib/exam-builder/parse-manual-mcqs';

describe('question bank CSV import', () => {
  it('parses quoted Java MCQ rows', () => {
    const csv = `question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
"Which keyword prevents inheritance in Java?","final","static","volatile","transient","A","final classes cannot be extended"
"Default value of boolean in Java?","1","true","false","null","C","boolean fields default to false"`;

    const parsed = parseMcqCsv(csv);
    expect(parsed.questions).toHaveLength(2);
    const first = parsed.questions[0];
    const second = parsed.questions[1];
    expect(first && 'correct_answer' in first ? first.correct_answer : null).toBe('A');
    expect(second && 'option_c' in second ? second.option_c : null).toBe('false');
  });
});
