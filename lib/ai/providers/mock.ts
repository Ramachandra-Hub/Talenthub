import type { AiGenerateRequest, AiGenerateResult, AiProvider } from '@/lib/ai/providers/types';

function anyRealAiProviderConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.HF_API_TOKEN?.trim() ||
      process.env.HUGGINGFACE_API_KEY?.trim() ||
      process.env.LOCAL_LLM_URL?.trim() ||
      process.env.OLLAMA_HOST?.trim(),
  );
}

/** True when mock/demo MCQs should be used (no external AI keys). */
export function isMockAiEnabled(): boolean {
  if (process.env.AI_MOCK === '1') return true;
  if (process.env.AI_MOCK === '0') return false;
  // Never auto-enable mock in production — exams must not publish demo MCQs silently.
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  ) {
    return false;
  }
  if (process.env.NODE_ENV === 'development') return true;
  return !anyRealAiProviderConfigured();
}

function parseMcqCountFromPrompt(prompt: string): number {
  const m =
    prompt.match(/Generate exactly\s+(\d+)/i) ||
    prompt.match(/exactly\s+(\d+)\s+distinct/i) ||
    prompt.match(/exactly\s+(\d+)\s+multiple-choice/i);
  if (m) {
    return Math.min(50, Math.max(1, Number(m[1]) || 4));
  }
  return 4;
}

function parseTopicsFromPrompt(prompt: string): string[] {
  const m = prompt.match(/Coverage:\s*([^\n]+)/i);
  if (!m) return ['General'];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDemoMcqJson(prompt: string): string {
  const total = parseMcqCountFromPrompt(prompt);
  const topics = parseTopicsFromPrompt(prompt);
  const rows = [];

  for (let i = 0; i < total; i += 1) {
    const topic = topics[i % topics.length] ?? 'General';
    const n = i + 1;
    rows.push({
      question_text: `[Demo AI — ${topic}] Question ${n}: A train travels 120 km in 2 hours at constant speed. How far does it travel in 5 hours at the same speed?`,
      options: ['240 km', '300 km', '280 km', '260 km'],
      correct_answer: 'B',
      explanation:
        'Demo placeholder: speed = 60 km/h, so distance in 5 h = 300 km. Set OPENAI_API_KEY or HF_API_TOKEN on Vercel for real AI-generated MCQs.',
      difficulty: 'medium',
      tags: [topic.toLowerCase().replace(/\s+/g, '-')],
    });
  }

  return JSON.stringify(rows);
}

let mockGenerateWarned = false;

/**
 * Returns valid MCQ JSON for syllabus flows when no external AI is configured.
 * Enable in production only with AI_MOCK=1 (not recommended for real exams).
 */
export function createMockAiProvider(): AiProvider {
  return {
    id: 'mock',
    isConfigured() {
      return isMockAiEnabled();
    },
    async generate(req: AiGenerateRequest): Promise<AiGenerateResult> {
      if (process.env.NODE_ENV === 'development' && !mockGenerateWarned) {
        mockGenerateWarned = true;
        console.warn(
          '[prepindia-web] Mock AI: start Ollama (LOCAL_LLM_URL / OLLAMA_HOST) or set HF_API_TOKEN etc. Using demo MCQs.',
        );
      }

      if (req.task === 'mcq_generate') {
        return {
          provider: 'mock',
          model: 'mock-offline-demo',
          text: buildDemoMcqJson(req.prompt),
          raw: { mock: true },
        };
      }

      const stub =
        '[Mock AI] Start Ollama (LOCAL_LLM_URL or OLLAMA_HOST) or set HF_API_TOKEN / OPENAI_API_KEY / etc. See docs/OLLAMA.md.';
      return {
        provider: 'mock',
        model: 'mock-offline-demo',
        text: stub,
        raw: { mock: true, task: req.task },
      };
    },
  };
}
