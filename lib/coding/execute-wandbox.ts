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
  java: ['openjdk-jdk-22+36', 'openjdk-jdk-21+35', 'openjdk'],
  python: ['cpython-3.11.7', 'cpython-3.10.10'],
};

let javaCompilerCache: { names: string[]; fetchedAt: number } | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function liveJavaCompilers(): Promise<string[]> {
  const now = Date.now();
  if (javaCompilerCache && now - javaCompilerCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return javaCompilerCache.names;
  }
  try {
    const res = await fetchWithTimeout(WANDBOX_LIST_URL, { cache: 'no-store' }, 4000);
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

function compilersFor(languageId: CodingLanguageId, liveJava: string[], fast?: boolean): string[] {
  if (languageId === 'java') {
    const preferred = [COMPILER_BY_LANGUAGE.java, ...liveJava, ...(COMPILER_FALLBACKS.java ?? [])];
    const unique = [...new Set(preferred.filter(Boolean))];
    return unique.slice(0, fast ? 1 : 3);
  }
  const list = [COMPILER_BY_LANGUAGE[languageId], ...(COMPILER_FALLBACKS[languageId] ?? [])].filter(
    Boolean,
  ) as string[];
  return fast ? list.slice(0, 1) : list;
}

function isRetryableCompilerError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('http 400') ||
    text.includes('http 404') ||
    text.includes('http 429') ||
    text.includes('http 500') ||
    text.includes('http 502') ||
    text.includes('http 503') ||
    text.includes('http 504') ||
    text.includes('unknown compiler') ||
    text.includes('compiler is not found') ||
    text.includes('not found') ||
    text.includes('fetch failed') ||
    text.includes('network') ||
    text.includes('aborted') ||
    text.includes('timeout') ||
    text.includes('econnreset') ||
    text.includes('enotfound')
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
): Promise<WandboxResponse> {
  const res = await fetchWithTimeout(
    WANDBOX_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler,
        code: prepareSource(languageId, sourceCode),
        stdin: stdin ?? '',
      }),
    },
    10_000,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wandbox HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }

  return (await res.json()) as WandboxResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeViaWandbox(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
  options?: { fast?: boolean },
): Promise<ExecuteResult> {
  const fast = Boolean(options?.fast);
  const liveJava = languageId === 'java' && !fast ? await liveJavaCompilers() : [];
  const compilers = compilersFor(languageId, liveJava, fast);
  const lang = getCodingLanguage(languageId);
  const started = Date.now();

  let data: WandboxResponse | null = null;
  let lastError: Error | null = null;
  const rounds = fast ? 1 : 2;

  for (let attempt = 0; attempt < rounds && !data; attempt += 1) {
    if (attempt > 0) await sleep(400 * attempt);

    for (const compiler of compilers) {
      try {
        data = await tryWandboxCompiler(compiler, languageId, sourceCode, stdin);
        const unknown =
          `${data.compiler_error ?? ''} ${data.compiler_message ?? ''} ${data.compiler_output ?? ''}`.toLowerCase();
        if (unknown.includes('unknown compiler') || unknown.includes('compiler is not found')) {
          lastError = new Error(`Unknown compiler: ${compiler}`);
          data = null;
          continue;
        }
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!isRetryableCompilerError(lastError.message)) {
          throw lastError;
        }
      }
    }
  }

  if (!data) {
    const detail = lastError?.message ?? 'Wandbox unavailable';
    throw new Error(`${lang.label} remote runner failed (${detail}). Try Compile & run again.`);
  }

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
}
