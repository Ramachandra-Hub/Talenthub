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

async function executeViaPiston(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
  url: string,
): Promise<ExecuteResult> {
  const lang = getCodingLanguage(languageId);
  const started = Date.now();
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
}

function localRuntimeMissing(result: ExecuteResult): boolean {
  const text = `${result.stderr} ${result.stdout}`.toLowerCase();
  return (
    text.includes('enoent') ||
    text.includes('not found') ||
    text.includes('was not found') ||
    text.includes('runtime not found') ||
    text.includes('cannot run') ||
    text.includes('serverless cannot run')
  );
}

async function executeRemote(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
): Promise<ExecuteResult> {
  const piston = pistonUrl();
  if (piston) {
    try {
      return await executeViaPiston(languageId, sourceCode, stdin, piston);
    } catch {
      /* try wandbox */
    }
  }

  if (!wandboxDisabled()) {
    return executeViaWandbox(languageId, sourceCode, stdin);
  }

  const lang = getCodingLanguage(languageId);
  throw new Error(
    `${lang.label} cannot run on this host. Set PISTON_API_URL (self-hosted Piston) or allow Wandbox (default on Vercel).`,
  );
}

function normalizeStdin(stdin: string): string {
  if (!stdin) return '';
  return stdin.endsWith('\n') ? stdin : `${stdin}\n`;
}

export async function executeCode(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin = '',
): Promise<ExecuteResult> {
  const lang = getCodingLanguage(languageId);
  stdin = normalizeStdin(stdin);

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
      return await executeRemote(languageId, sourceCode, stdin);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Remote execution failed';
      throw new Error(`${lang.label}: ${msg}`);
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
      throw new Error(
        `${lang.label}: ${msg}. Install the runtime locally or set PISTON_API_URL.`,
      );
    }
  }
}
