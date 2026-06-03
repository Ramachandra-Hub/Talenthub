#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensurePrismaEnv } from './ensure-prisma-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

ensurePrismaEnv();

const prismaBin = path.join(root, 'node_modules', '.bin', 'prisma');
const result = spawnSync(prismaBin, ['generate'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
