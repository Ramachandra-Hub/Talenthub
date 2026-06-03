import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import type { ExecuteResult } from '@/lib/coding/types';

const WANDBOX_URL =
  process.env.WANDBOX_API_URL?.trim() || 'https://wandbox.org/api/compile.json';

const COMPILER_BY_LANGUAGE: Record<CodingLanguageId, string> = {
  python: 'cpython-3.12.7',
  javascript: 'nodejs-20.17.0',
  c: 'gcc-13.2.0-c',
  cpp: 'gcc-13.2.0',
  java: 'openjdk-jdk-21+35',
  go: 'go-1.23.2',
  csharp: 'mono-6.12.0.199',
};

function prepareSource(languageId: CodingLanguageId, source: string): string {
  if (languageId === 'java') {
    return source.replace(/\bpublic\s+class\s+Main\b/g, 'class Main');
  }
  return source;
}

type WandboxResponse = {
  status?: string;
  program_output?: string;
  program_error?: string;
  compiler_output?: string;
  compiler_error?: string;
  compiler_message?: string;
  program_message?: string;
};

export async function executeViaWandbox(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
): Promise<ExecuteResult> {
  const compiler = COMPILER_BY_LANGUAGE[languageId];
  const lang = getCodingLanguage(languageId);
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(WANDBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler,
        code: prepareSource(languageId, sourceCode),
        stdin: stdin ?? '',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Wandbox HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
    }

    const data = (await res.json()) as WandboxResponse;
    const compileErr = [data.compiler_error, data.compiler_output].filter(Boolean).join('\n');
    const runErr = data.program_error ?? '';
    const stderr = [compileErr, runErr].filter(Boolean).join('\n').trim();
    const stdout = (data.program_output ?? data.program_message ?? '').trimEnd();

    const ok = data.status === '0' && !compileErr;
    return {
      stdout: stdout ? `${stdout}\n` : '',
      stderr,
      exitCode: ok ? 0 : 1,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'wandbox',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${lang.label} execution timed out on remote runner.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
