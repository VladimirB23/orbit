// Starts a Node tool from a path with one spelling: node scripts/run.mjs vite build
// VS Code may open the project as "d:\" while Node resolves modules as "D:\". Bundlers then
// see two Reacts and Vitest finds no tests.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [tool, ...args] = process.argv.slice(2);
const cwd = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
const folder = join(
  cwd,
  'node_modules',
  ...(tool === 'playwright' ? ['@playwright', 'test'] : [tool]),
);
const { bin } = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
const entry = join(folder, typeof bin === 'string' ? bin : bin[tool]);
const { status } = spawnSync(process.execPath, [entry, ...args], { cwd, stdio: 'inherit' });
process.exit(status ?? 1);
