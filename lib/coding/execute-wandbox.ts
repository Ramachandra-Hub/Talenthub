import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import type { ExecuteResult } from '@/lib/coding/types';

const WANDBOX_URL =
  process.env.WANDBOX_API_URL?.trim() || 'https://wandbox.org/api/compile.json';

const COMPILER_BY_LANGUAGE: Record<CodingLanguageId, string> = {
  python: 'cpython-3.12.7',
  javascript: 'nodejs-20.17.0',
  c: 'gcc-13.2.0-c',
  cpp: 'gcc-13.2.0',
  java: 'openjdk-jdk-17+35',
  go: 'go-1.23.2',
  csharp: 'mono-6.12.0.199',
};

// Fallback compilers tried if the primary returns HTTP 400 (version not available)
const COMPILER_FALLBACKS: Partial<Record<CodingLanguageId, string[]>> = {
  java: ['openjdk-jdk-21+35', 'openjdk-jdk-11.0.3+7'],
  python: ['cpython-3.11.7', 'cpython-3.10.10'],
};

function prepareSource(languageId: CodingLanguageId, source: string): string {
  if (languageId === 'java') {
    // Wandbox compiles Java without saving to a named file, so the class name
    // must match what the JVM expects. Keep "public class Main" as-is.
    // Only ensure the class is named Main (rename if student used a different name).
    const hasMain = /\bclass\s+Main\b/.test(source);
    if (!hasMain) {
      // If student wrote a different public class name, rename first occurrence
      return source.replace(/\bpublic\s+class\s+\w+/, 'public class Main');
    }
    return source;
  }
  return source;
}

type WandboxResponse = {
  status?: string | number;
  program_output?: string;
  program_error?: string;
  compiler_output?: string;
  compiler_error?: string;
  compiler_message?: string;
  program_message?: string;
};

async function tryWandboxCompiler(
  compiler: string,
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
  signal: AbortSignal,
): Promise<WandboxResponse> {
  const res = await fetch(WANDBOX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler,
      code: prepareSource(languageId, sourceCode),
      stdin: stdin ?? '',
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wandbox HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }

  return (await res.json()) as WandboxResponse;
}

export async function executeViaWandbox(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
): Promise<ExecuteResult> {
  const primaryCompiler = COMPILER_BY_LANGUAGE[languageId];
  const fallbacks = COMPILER_FALLBACKS[languageId] ?? [];
  const lang = getCodingLanguage(languageId);
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);

  try {
    let data: WandboxResponse | null = null;
    let lastError: Error | null = null;

    for (const compiler of [primaryCompiler, ...fallbacks]) {
      try {
        data = await tryWandboxCompiler(compiler, languageId, sourceCode, stdin, controller.signal);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Only retry on HTTP 400 (unknown compiler version) — other errors propagate
        if (!lastError.message.includes('HTTP 400')) throw lastError;
      }
    }

    if (!data) throw lastError ?? new Error('Wandbox unavailable');

    const compileErr = [data.compiler_error, data.compiler_output].filter(Boolean).join('\n');
    const runErr = data.program_error ?? '';
    const stderr = [compileErr, runErr].filter(Boolean).join('\n').trim();
    const stdout = (data.program_output ?? data.program_message ?? '').trimEnd();

    // Wandbox returns status as string "0" or number 0 on success
    const statusOk =
      String(data.status ?? '') === '0' || (!data.status && !compileErr && !stderr);
    const exitCode = compileErr ? 1 : statusOk ? 0 : 1;

    return {
      stdout: stdout ? `${stdout}\n` : '',
      stderr,
      exitCode,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'wandbox',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${lang.label} execution timed out. Check your code for infinite loops.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
