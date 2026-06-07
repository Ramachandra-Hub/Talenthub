import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { generateWithAi } from '@/lib/ai/providers/registry';
import type { AiGenerateRequest, AiTaskType } from '@/lib/ai/providers/types';

const ALLOWED_TASKS: AiTaskType[] = [
  'mcq_generate',
  'coding_question_generate',
  'interview_question_generate',
  'performance_analyze',
  'coding_hint',
  'code_explain',
  'resume_analyze',
  'recommend',
];

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['student', 'admin'], request);
    if ('response' in auth) return auth.response;

    const body = (await request.json()) as AiGenerateRequest;
    if (!body?.task || !ALLOWED_TASKS.includes(body.task)) {
      return NextResponse.json({ error: 'Invalid task type' }, { status: 400 });
    }
    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const result = await generateWithAi(body);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed';
    const status =
      message.includes('not configured') || message.includes('No AI provider') ? 503 : 500;
    return NextResponse.json(
      {
        error: message,
        hint:
          'On Vercel: set OPENAI_API_KEY or HF_API_TOKEN, or leave keys unset for demo MCQs (AI_MOCK auto). Set AI_MOCK=0 to disable demo mode.',
      },
      { status },
    );
  }
}
