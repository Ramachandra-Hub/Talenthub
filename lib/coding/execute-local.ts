import { chmod, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  getCodingLanguage,
  type CodingLanguageId,
} from '@/lib/coding/languages';
import { isServerlessHost } from '@/lib/coding/execute-environment';
import {
  augmentedPathEnv,
  resolveCommand,
  resolveNode,
  resolvePython,
} from '@/lib/coding/resolve-command';
import type { ExecuteResult } from '@/lib/coding/types';

const RUN_TIMEOUT_MS = 10000;
const COMPILE_TIMEOUT_MS = 20000;

function runProcess(
  command: string,
  args: string[],
  stdin: string,
  cwd: string,
  runtimeLabel: string,
  timeoutMs = RUN_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: augmentedPathEnv(),
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    };

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      stderr += '\n[Timed out after 8s]';
      finish(124);
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    proc.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) {
        stderr += isServerlessHost()
          ? `\n${runtimeLabel} is not available on serverless hosting (spawn blocked). Code runs via Wandbox on Vercel automatically.`
          : `\n${msg}\n\n${runtimeLabel} not found. Install it locally or restart \`npm run dev\` from Terminal.`;
      } else {
        stderr += msg;
      }
      finish(1);
    });
    proc.on('close', (code) => finish(code ?? 0));

    if (stdin) proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'rce-code-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runtimeMissingMessage(tool: string, detail: string): string {
  if (isServerlessHost()) {
    return `${detail}\n\n${tool} cannot run locally on Vercel — the app uses the Wandbox remote runner instead.`;
  }
  return `${detail}\n\nInstall ${tool} (e.g. Homebrew) and restart \`npm run dev\` from Terminal.`;
}

async function runPython(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const file = join(dir, 'main.py');
  const started = Date.now();
  let python: string;
  try {
    python = resolvePython();
  } catch (e) {
    return {
      stdout: '',
      stderr: runtimeMissingMessage('Python', e instanceof Error ? e.message : 'Python not found'),
      exitCode: 1,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'local',
    };
  }
  await writeFile(file, source, 'utf8');
  const { stdout, stderr, exitCode } = await runProcess(python, [file], stdin, dir, 'Python');
  return { stdout, stderr, exitCode, runtimeMs: Date.now() - started, memoryKb: null, engine: 'local' };
}

async function runJavaScript(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const file = join(dir, 'main.js');
  const started = Date.now();
  await writeFile(file, source, 'utf8');
  const node = resolveNode();
  const { stdout, stderr, exitCode } = await runProcess(node, [file], stdin, dir, 'Node.js');
  return { stdout, stderr, exitCode, runtimeMs: Date.now() - started, memoryKb: null, engine: 'local' };
}

async function runC(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const src = join(dir, 'main.c');
  const bin = join(dir, 'main');
  const started = Date.now();
  await writeFile(src, source, 'utf8');
  const gcc = resolveCommand('gcc', [process.env.GCC_PATH, 'gcc', '/usr/bin/gcc', '/opt/homebrew/bin/gcc']);
  const compile = await runProcess(gcc, ['-O2', '-o', bin, src], '', dir, 'GCC (C)', COMPILE_TIMEOUT_MS);
  if (compile.exitCode !== 0) {
    return {
      stdout: compile.stdout,
      stderr: compile.stderr || 'Compilation failed',
      exitCode: compile.exitCode,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'local',
    };
  }
  await chmod(bin, 0o755);
  const run = await runProcess(bin, [], stdin, dir, 'C program');
  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'local',
  };
}

async function runCpp(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const src = join(dir, 'main.cpp');
  const bin = join(dir, 'main');
  const started = Date.now();
  await writeFile(src, source, 'utf8');
  const gpp = resolveCommand('g++', [process.env.GPP_PATH, 'g++', '/usr/bin/g++', '/opt/homebrew/bin/g++']);
  const compile = await runProcess(gpp, ['-O2', '-std=c++17', '-o', bin, src], '', dir, 'G++ (C++)', COMPILE_TIMEOUT_MS);
  if (compile.exitCode !== 0) {
    return {
      stdout: compile.stdout,
      stderr: compile.stderr || 'Compilation failed',
      exitCode: compile.exitCode,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'local',
    };
  }
  await chmod(bin, 0o755);
  const run = await runProcess(bin, [], stdin, dir, 'C++ program');
  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'local',
  };
}

function javaEntryClassName(source: string): string {
  const publicMatch = source.match(/\bpublic\s+class\s+(\w+)/);
  if (publicMatch?.[1]) return publicMatch[1];
  const anyMatch = source.match(/\bclass\s+(\w+)/);
  return anyMatch?.[1] ?? 'Main';
}

async function runJava(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const className = javaEntryClassName(source);
  const file = join(dir, `${className}.java`);
  const started = Date.now();
  await writeFile(file, source, 'utf8');
  const javac = resolveCommand('javac', [process.env.JAVAC_PATH, 'javac', '/usr/bin/javac']);
  const compile = await runProcess(javac, [file], '', dir, 'Java compiler', COMPILE_TIMEOUT_MS);
  if (compile.exitCode !== 0) {
    return {
      stdout: compile.stdout,
      stderr: compile.stderr || 'Compilation failed',
      exitCode: compile.exitCode,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'local',
    };
  }
  const java = resolveCommand('java', [process.env.JAVA_PATH, 'java', '/usr/bin/java']);
  const run = await runProcess(java, ['-cp', dir, className], stdin, dir, 'Java');
  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'local',
  };
}

async function runGo(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const file = join(dir, 'main.go');
  const started = Date.now();
  await writeFile(file, source, 'utf8');
  const go = resolveCommand('go', [process.env.GO_PATH, 'go', '/usr/local/go/bin/go', '/opt/homebrew/bin/go']);
  const run = await runProcess(go, ['run', file], stdin, dir, 'Go', COMPILE_TIMEOUT_MS);
  if (run.stderr.includes('ENOENT') || run.stderr.includes('not found')) {
    return {
      stdout: '',
      stderr: 'Go is not installed on this server. Install Go or use another language.',
      exitCode: 1,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'local',
    };
  }
  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'local',
  };
}

async function runCSharp(dir: string, source: string, stdin: string): Promise<ExecuteResult> {
  const file = join(dir, 'Main.cs');
  const started = Date.now();
  await writeFile(file, source, 'utf8');

  const compile = await runProcess('mcs', ['-out:Main.exe', file], '', dir, 'Mono C#', 12000);
  if (compile.exitCode !== 0) {
    const dotnetCompile = await runProcess(
      'dotnet',
      ['new', 'console', '-o', 'proj', '--force'],
      '',
      dir,
      '.NET SDK',
      15000,
    );
    if (dotnetCompile.exitCode !== 0) {
      return {
        stdout: compile.stdout,
        stderr:
          compile.stderr ||
          'C# requires `mcs` (Mono) or `dotnet` SDK on the server. Install Mono or .NET SDK.',
        exitCode: 1,
        runtimeMs: Date.now() - started,
        memoryKb: null,
        engine: 'local',
      };
    }
    await writeFile(join(dir, 'proj', 'Program.cs'), source, 'utf8');
    const dotnetRun = await runProcess('dotnet', ['run', '--project', 'proj'], stdin, dir, '.NET', 15000);
    return {
      stdout: dotnetRun.stdout,
      stderr: dotnetRun.stderr,
      exitCode: dotnetRun.exitCode,
      runtimeMs: Date.now() - started,
      memoryKb: null,
      engine: 'local',
    };
  }

  const run = await runProcess('mono', ['Main.exe'], stdin, dir, 'Mono');
  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    runtimeMs: Date.now() - started,
    memoryKb: null,
    engine: 'local',
  };
}

export async function executeCodeLocal(
  languageId: CodingLanguageId,
  sourceCode: string,
  stdin = '',
): Promise<ExecuteResult> {
  return withTempDir(async (dir) => {
    switch (languageId) {
      case 'python':
        return runPython(dir, sourceCode, stdin);
      case 'javascript':
        return runJavaScript(dir, sourceCode, stdin);
      case 'c':
        return runC(dir, sourceCode, stdin);
      case 'cpp':
        return runCpp(dir, sourceCode, stdin);
      case 'java':
        return runJava(dir, sourceCode, stdin);
      case 'go':
        return runGo(dir, sourceCode, stdin);
      case 'csharp':
        return runCSharp(dir, sourceCode, stdin);
      default: {
        const lang = getCodingLanguage(languageId);
        return {
          stdout: '',
          stderr: `Local runner not configured for ${lang.label}`,
          exitCode: 1,
          runtimeMs: 0,
          memoryKb: null,
          engine: 'local',
        };
      }
    }
  });
}
