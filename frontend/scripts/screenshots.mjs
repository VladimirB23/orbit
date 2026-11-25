// Pictures for the README, only from fictional data: node scripts/screenshots.mjs
// Both databases are made anew in a temporary folder; data/ is never opened.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const backend = join(root, 'backend');
const python = join(backend, '.venv/Scripts/python.exe');
const out = join(root, 'docs/images');
const folder = mkdtempSync(join(tmpdir(), 'orbit-shots-'));
const env = { ...process.env, PYTHONUTF8: '1' };
delete env.ORBIT_VAULT;

const SHOTS = [
  { name: 'tree', seed: ['seed', '--demo'], db: 'demo.db', path: '/', height: 760 },
  { name: 'timeline', db: 'demo.db', path: '/?screen=timeline', height: 720 },
  {
    name: 'analytics',
    seed: ['seed', '--demo', '--half-year'],
    db: 'demo-half-year.db',
    path: '/?screen=analytics&period=90d',
    height: 1000,
  },
];

const freePort = () =>
  new Promise((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const { name, seed, db, path, height } of SHOTS) {
    const file = join(folder, db);
    const orbit = (...args) =>
      execFileSync(python, ['-m', 'orbit', '--db', file, ...args], { cwd: backend, env });
    if (seed) orbit(...seed);
    const port = await freePort();
    const server = spawn(
      python,
      ['-m', 'orbit', '--db', file, 'serve', '--no-open', '--port', String(port)],
      { cwd: backend, env, stdio: 'ignore' },
    );
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i += 1) {
      if (await fetch(`${url}/api/v1/meta`).catch(() => null)) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: 1360, height },
        colorScheme: theme,
        locale: 'ru-RU',
        deviceScaleFactor: 1.5,
      });
      await page.addInitScript(() =>
        localStorage.setItem(
          'orbit.expanded',
          JSON.stringify(['project-1', 'milestone-3', 'milestone-4']),
        ),
      );
      await page.goto(url + path);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, `${name}-${theme}.png`) });
      await page.close();
    }
    orbit('stop', '--port', String(port));
    server.kill();
  }
} finally {
  await browser.close();
  rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
