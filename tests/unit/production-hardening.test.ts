import { describe, expect, it, afterEach, vi } from 'vitest';
import { isMockAiEnabled } from '@/lib/ai/providers/mock';
import {
  getConfiguredAdminPassword,
  requireConfiguredAdminPassword,
} from '@/lib/admin-defaults';
import { executeJavaScriptInProcess } from '@/lib/coding/execute-inprocess-js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('production hardening', () => {
  it('does not auto-enable mock AI in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AI_MOCK', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('HF_API_TOKEN', '');
    vi.stubEnv('LOCAL_LLM_URL', '');
    vi.stubEnv('OLLAMA_HOST', '');
    expect(isMockAiEnabled()).toBe(false);
  });

  it('allows explicit AI_MOCK=1 even in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_MOCK', '1');
    expect(isMockAiEnabled()).toBe(true);
  });

  it('refuses hardcoded admin password in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PREPINDIA_ADMIN_PASSWORD', '');
    expect(getConfiguredAdminPassword()).toBeNull();
    expect(() => requireConfiguredAdminPassword()).toThrow(/PREPINDIA_ADMIN_PASSWORD/);
  });

  it('disables in-process JS execution in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const result = executeJavaScriptInProcess('console.log(1)', '');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/disabled in production/i);
  });
});
