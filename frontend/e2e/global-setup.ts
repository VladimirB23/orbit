import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cli, TEMPLATE } from './orbit';

/** A seeded database as one file, without -wal and -shm companions, ready to be copied. */
export default function setup() {
  const folder = dirname(TEMPLATE);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const seeded = join(folder, 'demo.db');
  cli(seeded, 'seed', '--demo');
  cli(seeded, 'backup', '--dir', join(folder, 'copy'));
  const [copy] = readdirSync(join(folder, 'copy'));
  renameSync(join(folder, 'copy', copy ?? ''), TEMPLATE);
}
