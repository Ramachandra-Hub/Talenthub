import { isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';

const LANGUAGE_ALIASES: Record<string, CodingLanguageId> = {
  python3: 'python',
  py: 'python',
  js: 'javascript',
  node: 'javascript',
  'c++': 'cpp',
  cpp17: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  golang: 'go',
};

export type CodingRunRequest = {
  language: CodingLanguageId;
  sourceCode: string;
  stdin: string;
};

export function normalizeCodingLanguage(raw: unknown): CodingLanguageId | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (isCodingLanguageId(key)) return key;
  return LANGUAGE_ALIASES[key] ?? null;
}

export function parseCodingRunRequest(
  body: unknown,
): CodingRunRequest | { error: string; empty?: boolean } {
  if (!body || typeof body !== 'object') {
    return { error: 'JSON body required' };
  }

  const record = body as Record<string, unknown>;
  const language = normalizeCodingLanguage(record.language ?? record.lang);
  if (!language) {
    return {
      error: `Unsupported language. Use one of: python, java, c, cpp, javascript, go, csharp.`,
    };
  }

  const rawSource =
    typeof record.sourceCode === 'string'
      ? record.sourceCode
      : typeof record.code === 'string'
        ? record.code
        : typeof record.source === 'string'
          ? record.source
          : '';

  const sourceCode = rawSource.length > 0 ? rawSource : '';
  if (!sourceCode.trim()) {
    return {
      error: 'Source code is empty. Type your solution in the editor before running.',
      empty: true,
    };
  }

  const stdin =
    typeof record.stdin === 'string'
      ? record.stdin
      : typeof record.input === 'string'
        ? record.input
        : '';

  return { language, sourceCode, stdin };
}
