import { createClaudeProvider } from '@/lib/ai/providers/claude';
import { createGeminiProvider } from '@/lib/ai/providers/gemini';
import { createHuggingfaceProvider } from '@/lib/ai/providers/huggingface';
import { createLocalLlmProvider } from '@/lib/ai/providers/local';
import { createMockAiProvider } from '@/lib/ai/providers/mock';
import { isOllamaConfigured } from '@/lib/ai/providers/ollama-config';
import { createOpenAiProvider } from '@/lib/ai/providers/openai';
import type { AiGenerateRequest, AiGenerateResult, AiProvider, AiProviderId } from '@/lib/ai/providers/types';

const providers: Record<AiProviderId, AiProvider> = {
  openai: createOpenAiProvider(),
  gemini: createGeminiProvider(),
  claude: createClaudeProvider(),
  huggingface: createHuggingfaceProvider(),
  local: createLocalLlmProvider(),
  mock: createMockAiProvider(),
};

function normalizeExplicitProvider(raw: string): AiProviderId | undefined {
  const t = raw.trim().toLowerCase();
  if (!t) return undefined;
  if (t === 'ollama') return 'local';
  if (t in providers) return t as AiProviderId;
  return undefined;
}

/**
 * When AI_PROVIDER is unset: prefer Ollama if configured, else Hugging Face if configured, else huggingface (noop).
 * If both Ollama and HF are set, prefer Ollama for typical local-dev setups.
 */
function resolvePreferredProvider(): AiProviderId {
  const explicit = process.env.AI_PROVIDER?.trim();
  if (explicit) {
    const id = normalizeExplicitProvider(explicit);
    if (id) return id;
  }

  const localUp = isOllamaConfigured();
  const hfUp =
    Boolean(process.env.HF_API_TOKEN?.trim()) ||
    Boolean(process.env.HUGGINGFACE_API_KEY?.trim());

  if (localUp && hfUp) return 'local';
  if (localUp) return 'local';
  if (hfUp) return 'huggingface';
  return 'huggingface';
}

function dedupeOrder(order: AiProviderId[]): AiProviderId[] {
  const seen = new Set<AiProviderId>();
  const out: AiProviderId[] = [];
  for (const id of order) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function getAiProvider(id?: AiProviderId): AiProvider | null {
  const preferred = resolvePreferredProvider();
  const order = dedupeOrder(
    id
      ? [id, preferred, 'local', 'huggingface', 'openai', 'gemini', 'claude']
      : [preferred, 'local', 'huggingface', 'openai', 'gemini', 'claude'],
  );

  for (const key of order) {
    const p = providers[key];
    if (p?.isConfigured()) return p;
  }

  if (providers.mock.isConfigured()) {
    return providers.mock;
  }

  return null;
}

export async function generateWithAi(req: AiGenerateRequest): Promise<AiGenerateResult> {
  const provider = getAiProvider();
  if (!provider?.isConfigured()) {
    throw new Error(
      'No AI provider configured. Set OPENAI_API_KEY, HF_API_TOKEN, or LOCAL_LLM_URL (Ollama). For demo MCQs without keys, set AI_MOCK=1 on Vercel.',
    );
  }

  try {
    return await provider.generate(req);
  } catch (err) {
    const mock = providers.mock;
    if (provider.id !== 'mock' && mock.isConfigured()) {
      const fallback = await mock.generate(req);
      return {
        ...fallback,
        text: `${fallback.text}\n\n[Note: Primary AI provider failed; demo MCQs were used. Check API keys on Vercel.]`,
      };
    }
    throw err;
  }
}
