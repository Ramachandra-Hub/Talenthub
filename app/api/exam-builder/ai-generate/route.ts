import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { resolveSyllabusTopicsForBuilder } from '@/lib/exam-builder/draw-questions';
import { parseAiTextToFacultyQuestions } from '@/lib/exam-builder/parse-ai-faculty-mcqs';
import { getExamBuilderTestType } from '@/lib/exam-builder/test-catalog';
import { generateWithAi } from '@/lib/ai/providers/registry';

function buildMcqPrompt(input: {
  testLabel: string;
  topicNames: string[];
  questionsPerTopic: number;
  difficulty: string;
}): string {
  const total = input.topicNames.length * input.questionsPerTopic;
  const topics = input.topicNames.join(', ');
  return `You are a senior placement and campus recruitment examiner. Write exactly ${total} distinct multiple-choice questions (4 options each) for an internal college examination.

Test / paper: ${input.testLabel}
Coverage: ${topics}
Difficulty: ${input.difficulty}

Generate ${input.questionsPerTopic} questions per topic listed above, in topic order (all questions for topic 1 first, then topic 2, etc.). Each question must be self-contained, unambiguous, and suitable for ${input.difficulty} level undergraduate engineering students.

Output rules (critical):
- Respond with ONLY a valid JSON array. No markdown fences, no commentary before or after.
- Each element must be an object with keys: question_text, option_a, option_b, option_c, option_d, correct_answer (single letter A, B, C, or D), explanation (one short sentence).
- Do not repeat questions or copy definitions verbatim; vary numeric values and scenarios when applicable.

Example shape (do not copy text):
[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"B","explanation":"..."}]`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const testType = String(body.testType ?? '');
  const def = getExamBuilderTestType(testType);
  if (!def) {
    return NextResponse.json({ error: 'Invalid test type' }, { status: 400 });
  }
  if (def.id === 'department-manual') {
    return NextResponse.json({ error: 'Manual exams use the question editor directly' }, { status: 400 });
  }
  if (!def.requiresSyllabus) {
    return NextResponse.json({ error: 'This test type does not use syllabus topics' }, { status: 400 });
  }

  const topicIds = Array.isArray(body.topicIds) ? (body.topicIds as string[]) : [];
  const questionsPerTopic = Math.min(
    50,
    Math.max(1, Number(body.questionsPerTopic) || def.defaultQuestionsPerTopic),
  );
  const difficulty = String(body.difficulty ?? 'medium').trim() || 'medium';

  let topicNames: string[];
  try {
    const resolved = await resolveSyllabusTopicsForBuilder(admin, topicIds);
    topicNames = resolved.map((t) => t.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid topics';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const prompt = buildMcqPrompt({
    testLabel: def.name,
    topicNames,
    questionsPerTopic,
    difficulty,
  });

  let text = '';
  let usedProvider = '';
  try {
    const result = await generateWithAi({
      task: 'mcq_generate',
      prompt,
      maxTokens: 8192,
    });
    text = result.text;
    usedProvider = result.provider;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed';
    const status = message.includes('not configured') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const questions = parseAiTextToFacultyQuestions(text);
  const warnings: string[] = [];
  if (usedProvider === 'mock') {
    warnings.push(
      'Offline demo MCQs only (no AI keys). Set HF_API_TOKEN, LOCAL_LLM_URL, or another provider for real generation.',
    );
  }
  const expected = topicNames.length * questionsPerTopic;
  if (questions.length < expected) {
    warnings.push(
      `Model returned ${questions.length} parseable question(s); target was ${expected}. Try again, reduce questions per topic, or switch model (HF_MODEL / LOCAL_LLM_URL).`,
    );
  }
  if (questions.length === 0) {
    return NextResponse.json(
      {
        error:
          'Could not parse MCQs from the model response. Retry once, or use "Draw from question bank" if your bank is populated.',
        rawPreview: text.slice(0, 800),
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    questions,
    total: questions.length,
    topicsUsed: topicNames.map((name) => ({ name, requested: questionsPerTopic })),
    warnings,
  });
}
