import {
  getCodingLanguage,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import { isServerlessHost } from '@/lib/coding/execute-environment';
import { executeJavaScriptInProcess } from '@/lib/coding/execute-inprocess-js';
import { executeCodeLocal } from '@/lib/coding/execute-local';
import { executeViaWandbox } from '@/lib/coding/execute-wandbox';
import type { ExecuteResult } from '@/lib/coding/types';

export type { CodingLanguageId as CodingLanguage };
export type { ExecuteResult } from '@/lib/coding/types';

const PUBLIC_PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const PUBLIC_PISTON_HOST = 'emkc.org';

function pistonUrl(): string | null {
  const url = process.env.PISTON_API_URL?.trim();
  if (!url || url.includes('YOUR_')) return null;
  try {
    const host = new URL(url).hostname;
    if (host === PUBLIC_PISTON_HOST || host.endsWith('.emkc.org')) return null;
    return url;
  } catch {
    return null;
  }
}

function wandboxDisabled(): boolean {
  return process.env.CODING_DISABLE_WANDBOX === '1' || process.env.CODING_DISABLE_WANDBOX === 'true';
}

function publicPistonDisabled(): boolean {
  return (
    process.env.CODING_DISABLE_PUBLIC_PISTON === '1' ||
    process.env.CODING_DISABLE_PUBLIC_PISTON === 'true'
  );
}

async function executeViaPiston(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
  url: string,
  timeoutMs = 12_000,
): Promise<ExecuteResult> {
  const lang = getCodingLanguage(languageId);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: lang.piston.language,
        version: lang.piston.version,
        files: [{ name: lang.fileName, content: sourceCode }],
        stdin,
        run_timeout: 8000,
        compile_timeout: 12000,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Piston HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    const data = (await res.json()) as {
      run?: { stdout?: string; stderr?: string; code?: number; memory?: number };
      compile?: { stdout?: string; stderr?: string; code?: number };
    };

    const compileErr = data.compile?.stderr ?? '';
    const runOut = data.run?.stdout ?? '';
    const runErr = data.run?.stderr ?? '';
    const stderr = [compileErr, runErr].filter(Boolean).join('\n');
    return {
      stdout: runOut,
      stderr,
      exitCode: data.run?.code ?? (compileErr ? 1 : 0),
      runtimeMs: Date.now() - started,
      memoryKb: data.run?.memory ?? null,
      engine: url.includes('emkc.org') ? 'piston-public' : 'piston',
    };
  } finally {
    clearTimeout(timer);
  }
}

function localRuntimeMissing(result: ExecuteResult): boolean {
  const text = `${result.stderr} ${result.stdout}`.toLowerCase();
  return (
    text.includes('enoent') ||
    text.includes('not found') ||
    text.includes('was not found') ||
    text.includes('runtime not found') ||
    text.includes('cannot run') ||
    text.includes('serverless cannot run') ||
    text.includes('oci runtime error') ||
    text.includes('crun: clone') ||
    text.includes('resource temporarily unavailable') ||
    text.includes('cannot allocate memory') ||
    text.includes('failed to create shim task')
  );
}

function softFailure(languageId: CodingLanguageId, message: string, started: number): ExecuteResult {
  const lang = getCodingLanguage(languageId);
  return {
    stdout: '',
    stderr: `${lang.label}: ${message}\n\nClick Compile & run again. If this keeps happening, wait a few seconds and retry.`,
    exitCode: 1,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'fallback',
  };
}

async function executeRemote(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
  interactive = false,
): Promise<ExecuteResult> {
  const errors: string[] = [];

  const piston = pistonUrl();
  if (piston) {
    try {
      return await executeViaPiston(languageId, sourceCode, stdin, piston, interactive ? 8_000 : 12_000);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!wandboxDisabled()) {
    try {
      return await executeViaWandbox(languageId, sourceCode, stdin, { fast: interactive });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!interactive && !publicPistonDisabled()) {
    try {
      return await executeViaPiston(languageId, sourceCode, stdin, PUBLIC_PISTON_URL, 10_000);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors.filter(Boolean).join(' | ') || 'All remote runners failed');
}

function normalizeStdin(stdin: string): string {
  if (!stdin) return '';
  return stdin.endsWith('\n') ? stdin : `${stdin}\n`;
}

export async function executeCode(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin = '',
  options?: { interactive?: boolean },
): Promise<ExecuteResult> {
  const started = Date.now();
  stdin = normalizeStdin(stdin);
  const interactive = Boolean(options?.interactive);

  if (isServerlessHost()) {
    if (languageId === 'javascript') {
      try {
        const inProc = executeJavaScriptInProcess(sourceCode, stdin);
        if (inProc.exitCode === 0 || !localRuntimeMissing(inProc)) {
          return inProc;
        }
      } catch {
        /* remote */
      }
    }
    try {
      return await executeRemote(languageId, sourceCode, stdin, interactive);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Remote execution failed';
      return softFailure(languageId, msg, started);
    }
  }

  const piston = pistonUrl();
  if (piston) {
    try {
      return await executeViaPiston(languageId, sourceCode, stdin, piston);
    } catch {
      /* local */
    }
  }

  try {
    const local = await executeCodeLocal(languageId, sourceCode, stdin);
    if (localRuntimeMissing(local)) {
      if (languageId === 'javascript') {
        try {
          return executeJavaScriptInProcess(sourceCode, stdin);
        } catch {
          /* wandbox */
        }
      }
      try {
        return await executeRemote(languageId, sourceCode, stdin);
      } catch {
        return local;
      }
    }
    return local;
  } catch (error) {
    try {
      return await executeRemote(languageId, sourceCode, stdin);
    } catch {
      const msg = error instanceof Error ? error.message : 'Execution failed';
      return softFailure(languageId, msg, started);
    }
  }
}
