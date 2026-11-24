/** Runs the real backend for tests. Never touches data/orbit.db: --db is always given. */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const backend = resolve(import.meta.dirname, '../../backend');
const windows = join(backend, '.venv/Scripts/python.exe');
const python = existsSync(windows) ? windows : join(backend, '.venv/bin/python');
const env = { ...process.env, ORBIT_ACTOR: 'claude', PYTHONUTF8: '1' };

export const TEMPLATE = resolve(import.meta.dirname, '../node_modules/.tmp/e2e/demo-template.db');

/** One CLI command, as Claude would run it in a terminal. */
export function cli(db: string, ...args: string[]) {
  const out = execFileSync(python, ['-m', 'orbit', '--db', db, ...args, '--json'], {
    cwd: backend,
    env,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

export function freePort(): Promise<number> {
  return new Promise((done) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => done(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

export async function serve(db: string, port: number, vault: string): Promise<ChildProcess> {
  const child = spawn(
    python,
    ['-m', 'orbit', '--db', db, 'serve', '--no-open', '--port', String(port)],
    { cwd: backend, env: { ...env, ORBIT_VAULT: vault }, stdio: 'ignore' },
  );
  for (let i = 0; i < 200; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/v1/meta`)).ok) return child;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  child.kill();
  throw new Error('orbit serve did not start');
}

export function stop(child: ChildProcess): Promise<void> {
  return new Promise((done) => {
    if (child.exitCode !== null) return done();
    child.once('exit', () => done());
    child.kill();
  });
}
