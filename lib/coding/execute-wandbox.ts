import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import type { ExecuteResult } from '@/lib/coding/types';

const WANDBOX_URL =
  process.env.WANDBOX_API_URL?.trim() || 'https://wandbox.org/api/compile.json';
const WANDBOX_LIST_URL = 'https://wandbox.org/api/list.json';

const COMPILER_BY_LANGUAGE: Record<CodingLanguageId, string> = {
  python: 'cpython-3.12.7',
  javascript: 'nodejs-20.17.0',
  c: 'gcc-13.2.0-c',
  cpp: 'gcc-13.2.0',
  java: 'openjdk-jdk-21+35',
  go: 'go-1.23.2',
  csharp: 'mono-6.12.0.199',
};

const COMPILER_FALLBACKS: Partial<Record<CodingLanguageId, string[]>> = {
  java: ['openjdk-jdk-22+36', 'openjdk-jdk-21+35'],
  python: ['cpython-3.11.7', 'cpython-3.10.10'],
};

let javaCompilerCache: { names: string[]; fetchedAt: number } | null = null;

async function liveJavaCompilers(): Promise<string[]> {
  const now = Date.now();
  if (javaCompilerCache && now - javaCompilerCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return javaCompilerCache.names;
  }
  try {
    const res = await fetch(WANDBOX_LIST_URL, { cache: 'no-store' });
    if (!res.ok) return COMPILER_FALLBACKS.java ?? [];
    const list = (await res.json()) as Array<{ name?: string; language?: string }>;
    const names = list
      .filter((row) => String(row.language ?? '').toLowerCase() === 'java' && row.name)
      .map((row) => String(row.name));
    if (names.length) {
      javaCompilerCache = { names, fetchedAt: now };
      return names;
    }
  } catch {
    /* use static list */
  }
  return COMPILER_FALLBACKS.java ?? [];
}

/** Wandbox compiles Java as prog.java, so the public/main class must be `prog`. */
export function prepareJavaSourceForWandbox(source: string): string {
  let next = source.replace(/\r\n/g, '\n');
  if (/\bpublic\s+class\s+\w+/.test(next)) {
    next = next.replace(/\bpublic\s+class\s+\w+/, 'public class prog');
  } else if (/\bclass\s+\w+/.test(next)) {
    next = next.replace(/\bclass\s+\w+/, 'class prog');
  }
  return next;
}

function prepareSource(languageId: CodingLanguageId, source: string): string {
  if (languageId === 'java') return prepareJavaSourceForWandbox(source);
  return source;
}

function compilersFor(languageId: CodingLanguageId, liveJava: string[]): string[] {
  if (languageId === 'java') {
    const preferred = [COMPILER_BY_LANGUAGE.java, ...liveJava, ...(COMPILER_FALLBACKS.java ?? [])];
    return [...new Set(preferred.filter(Boolean))];
  }
  return [COMPILER_BY_LANGUAGE[languageId], ...(COMPILER_FALLBACKS[languageId] ?? [])].filter(
    Boolean,
  ) as string[];
}

function isRetryableCompilerError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('http 400') ||
    text.includes('http 404') ||
    text.includes('http 500') ||
    text.includes('unknown compiler') ||
    text.includes('compiler is not found') ||
    text.includes('not found')
  );
}

type WandboxResponse = {
  status?: string | number;
  program_output?: string;
  program_error?: string;
  compiler_output?: string;
  compiler_error?: string;
  compiler_message?: string;
  program_message?: string;
  signal?: string;
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
  const liveJava = languageId === 'java' ? await liveJavaCompilers() : [];
  const compilers = compilersFor(languageId, liveJava);
  const lang = getCodingLanguage(languageId);
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);

  try {
    let data: WandboxResponse | null = null;
    let lastError: Error | null = null;

    for (const compiler of compilers) {
      try {
        data = await tryWandboxCompiler(compiler, languageId, sourceCode, stdin, controller.signal);
        const unknown =
          `${data.compiler_error ?? ''} ${data.compiler_message ?? ''} ${data.compiler_output ?? ''}`.toLowerCase();
        if (unknown.includes('unknown compiler') || unknown.includes('compiler is not found')) {
          lastError = new Error(`Unknown compiler: ${compiler}`);
          continue;
        }
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!isRetryableCompilerError(lastError.message)) throw lastError;
      }
    }

    if (!data) throw lastError ?? new Error('Wandbox unavailable');

    const compileErr = String(data.compiler_error ?? '').trim();
    const runErr = String(data.program_error ?? '').trim();
    const stderr = [compileErr, runErr].filter(Boolean).join('\n').trim();
    const stdoutRaw = data.program_output ?? '';
    const stdout = stdoutRaw.trimEnd();
    const statusOk = String(data.status ?? '') === '0';
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
