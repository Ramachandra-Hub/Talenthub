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

const PUBLIC_PISTON_HOST = 'emkc.org';

/**
 * Self-hosted Piston only. Public emkc.org Piston is whitelist-only since 2026-02-15
 * and returns HTTP 401 for unlisted apps — do not call it during exams.
 */
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

/** Piston executes Java as Main.java — public/main class must be Main. */
function prepareJavaSourceForPiston(source: string): string {
  let next = source.replace(/\r\n/g, '\n');
  if (/\bpublic\s+class\s+\w+/.test(next)) {
    next = next.replace(/\bpublic\s+class\s+\w+/, 'public class Main');
  } else if (/\bclass\s+\w+/.test(next)) {
    next = next.replace(/\bclass\s+\w+/, 'class Main');
  }
  return next;
}

function prepareSourceForPiston(languageId: CodingLanguageId, source: string): string {
  if (languageId === 'java') return prepareJavaSourceForPiston(source);
  return source;
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
        files: [{ name: lang.fileName, content: prepareSourceForPiston(languageId, sourceCode) }],
        stdin,
        run_timeout: Math.min(8_000, Math.max(3_000, timeoutMs - 2_000)),
        compile_timeout: Math.min(10_000, Math.max(4_000, timeoutMs - 1_000)),
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
      engine: 'piston',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Host/container infra failures — not student code errors; retry another runner. */
function isInfraRunnerFailure(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('enoent') ||
    t.includes('not found') ||
    t.includes('was not found') ||
    t.includes('runtime not found') ||
    t.includes('cannot run') ||
    t.includes('serverless cannot run') ||
    t.includes('oci runtime error') ||
    t.includes('crun: clone') ||
    t.includes('crun:') ||
    t.includes('resource temporarily unavailable') ||
    t.includes('cannot allocate memory') ||
    t.includes('failed to create shim task') ||
    t.includes('container create failed') ||
    t.includes('runc:') ||
    t.includes('no space left')
  );
}

function localRuntimeMissing(result: ExecuteResult): boolean {
  return isInfraRunnerFailure(`${result.stderr} ${result.stdout}`);
}

function softFailure(languageId: CodingLanguageId, message: string, started: number): ExecuteResult {
  const lang = getCodingLanguage(languageId);
  const clean = message
    .replace(/this operation was aborted/gi, 'remote compiler timed out')
    .replace(/piston http 401[^|]*/gi, '')
    .replace(/oci runtime error[^|]*/gi, '')
    .replace(/crun:[^|]*/gi, '')
    .replace(/resource temporarily unavailable[^|]*/gi, '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    stdout: '',
    stderr: `${lang.label}: ${clean || 'Remote compiler unavailable'}\n\nClick Compile & run again. Paste sample input if your program reads stdin.`,
    exitCode: 1,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'fallback',
  };
}

/**
 * Vercel / serverless: Wandbox is the public runner (no whitelist).
 * Optional self-hosted PISTON_API_URL is tried first when configured.
 */
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
      const pistonResult = await executeViaPiston(
        languageId,
        sourceCode,
        stdin,
        piston,
        interactive ? 12_000 : 15_000,
      );
      // Self-hosted Piston often returns HTTP 200 with OCI/crun errors in stderr.
      if (!localRuntimeMissing(pistonResult)) {
        return pistonResult;
      }
      errors.push(pistonResult.stderr || 'Piston container unavailable');
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!wandboxDisabled()) {
    try {
      return await executeViaWandbox(languageId, sourceCode, stdin);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const detail = errors
    .filter(
      (e) =>
        !/piston http 401|whitelist only|oci runtime|crun:|resource temporarily unavailable/i.test(
          e,
        ),
    )
    .join(' | ');
  throw new Error(detail || 'Remote compiler unavailable. Try again in a few seconds.');
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
      const pistonResult = await executeViaPiston(languageId, sourceCode, stdin, piston);
      if (!localRuntimeMissing(pistonResult)) {
        return pistonResult;
      }
    } catch {
      /* local / wandbox */
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
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Remote execution failed';
        return softFailure(languageId, msg, started);
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
