import type { FacultyExamQuestion, FacultyMcqQuestion } from '@/lib/faculty-exams';

function letterOk(s: string): s is FacultyMcqQuestion['correct_answer'] {
  return /^[ABCD]$/.test(s);
}

/** Parse AI JSON/markdown responses into faculty exam MCQs. */
export function parseAiTextToFacultyQuestions(raw: string): FacultyExamQuestion[] {
  const trimmed = raw.trim();
  const out: FacultyExamQuestion[] = [];

  try {
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const arr = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const text = String(row.question_text ?? row.question ?? '').trim();
      if (!text) continue;

      const optionsRaw = row.options;
      let option_a = '';
      let option_b = '';
      let option_c = '';
      let option_d = '';
      if (Array.isArray(optionsRaw) && optionsRaw.length >= 4) {
        option_a = String(optionsRaw[0] ?? '').trim();
        option_b = String(optionsRaw[1] ?? '').trim();
        option_c = String(optionsRaw[2] ?? '').trim();
        option_d = String(optionsRaw[3] ?? '').trim();
      } else {
        option_a = String(row.option_a ?? '').trim();
        option_b = String(row.option_b ?? '').trim();
        option_c = String(row.option_c ?? '').trim();
        option_d = String(row.option_d ?? '').trim();
      }

      let correct = String(row.correct_answer ?? row.answer ?? 'A').trim().toUpperCase();
      if (correct.length > 1) correct = correct.charAt(0);
      const correct_answer: FacultyMcqQuestion['correct_answer'] = letterOk(correct) ? correct : 'A';

      if (!option_a || !option_b || !option_c || !option_d) continue;

      out.push({
        question_text: text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_answer,
        explanation: row.explanation ? String(row.explanation) : undefined,
      });
    }
  } catch {
    return [];
  }

  return out;
}
