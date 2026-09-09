import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import type { ExecuteResult } from '@/lib/coding/types';

/**
 * Judge0 CE public API (or self-hosted via JUDGE0_API_URL).
 * Used when Wandbox is unavailable (HTTP 500 / container uid failures).
 */
const DEFAULT_JUDGE0 = 'https://ce.judge0.com';

/** Judge0 CE language IDs — prefer stable CE IDs that work on ce.judge0.com */
const JUDGE0_LANGUAGE_ID: Partial<Record<CodingLanguageId, number>> = {
  java: 62, // OpenJDK
  python: 71, // Python 3
  javascript: 63, // Node.js
  c: 50, // GCC C
  cpp: 54, // GCC C++
  go: 60,
  csharp: 51,
};

function judge0BaseUrl(): string | null {
  if (process.env.CODING_DISABLE_JUDGE0 === '1' || process.env.CODING_DISABLE_JUDGE0 === 'true') {
    return null;
  }
  const raw = process.env.JUDGE0_API_URL?.trim() || DEFAULT_JUDGE0;
  if (!raw || raw.includes('YOUR_')) return null;
  return raw.replace(/\/+$/, '');
}

function prepareJavaForJudge0(source: string): string {
  let next = source.replace(/\r\n/g, '\n');
  if (/\bpublic\s+class\s+\w+/.test(next)) {
    next = next.replace(/\bpublic\s+class\s+\w+/, 'public class Main');
  } else if (/\bclass\s+\w+/.test(next)) {
    next = next.replace(/\bclass\s+\w+/, 'class Main');
  }
  return next;
}

function prepareSource(languageId: CodingLanguageId, source: string): string {
  if (languageId === 'java') return prepareJavaForJudge0(source);
  return source;
}

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

type Judge0Submission = {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: { id?: number; description?: string };
  time?: string | null;
  memory?: number | null;
};

export async function executeViaJudge0(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin: string,
): Promise<ExecuteResult> {
  const base = judge0BaseUrl();
  if (!base) {
    throw new Error('Judge0 runner is disabled');
  }
  const language_id = JUDGE0_LANGUAGE_ID[languageId];
  if (!language_id) {
    throw new Error(`Judge0 does not support language: ${languageId}`);
  }

  const started = Date.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const key = process.env.JUDGE0_AUTH_TOKEN?.trim() || process.env.X_RAPIDAPI_KEY?.trim();
  if (key) {
    // RapidAPI-style Judge0 or token gate
    if (process.env.JUDGE0_USE_RAPIDAPI === '1') {
      headers['X-RapidAPI-Key'] = key;
      headers['X-RapidAPI-Host'] = process.env.JUDGE0_RAPIDAPI_HOST?.trim() || 'judge0-ce.p.rapidapi.com';
    } else {
      headers.Authorization = `Bearer ${key}`;
    }
  }

  const url = `${base}/submissions?base64_encoded=false&wait=true`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_code: prepareSource(languageId, sourceCode),
        language_id,
        stdin: stdin ?? '',
      }),
    },
    20_000,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Judge0 HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }

  const data = (await res.json()) as Judge0Submission;
  const compileErr = String(data.compile_output ?? '').trim();
  const runErr = String(data.stderr ?? '').trim();
  const message = String(data.message ?? '').trim();
  const stderr = [compileErr, runErr, message].filter(Boolean).join('\n').trim();
  const stdoutRaw = data.stdout ?? '';
  const statusId = data.status?.id ?? 0;
  // 3 = Accepted
  const accepted = statusId === 3;
  const exitCode = accepted ? 0 : compileErr || !accepted ? 1 : 0;

  return {
    stdout: stdoutRaw ? (stdoutRaw.endsWith('\n') ? stdoutRaw : `${stdoutRaw}\n`) : '',
    stderr,
    exitCode,
    runtimeMs: Date.now() - started,
    memoryKb: data.memory ?? null,
    engine: 'judge0',
  };
}

export function isJudge0Available(): boolean {
  return Boolean(judge0BaseUrl());
}
