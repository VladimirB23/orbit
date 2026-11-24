import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { cli, freePort, serve, stop, TEMPLATE } from './orbit';

interface Orbit {
  db: string;
  url: string;
  /** An empty Obsidian vault of this test. */
  vault: string;
  cli: (...args: string[]) => ReturnType<typeof cli>;
  stopServer: () => Promise<void>;
  startServer: () => Promise<void>;
}

export const test = base.extend<{ orbit: Orbit; problems: string[] }>({
  orbit: async ({ page }, use) => {
    const folder = mkdtempSync(join(tmpdir(), 'orbit-e2e-'));
    const db = join(folder, 'demo.db');
    copyFileSync(TEMPLATE, db);
    const vault = join(folder, 'Study vault');
    const port = await freePort();
    let server = await serve(db, port, vault);
    const url = `http://127.0.0.1:${port}`;
    await page.goto(url);
    await page.getByRole('treegrid').waitFor();
    await use({
      db,
      url,
      vault,
      cli: (...args) => cli(db, ...args),
      stopServer: () => stop(server),
      startServer: async () => {
        server = await serve(db, port, vault);
      },
    });
    await page.close();
    await stop(server);
    rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
  },
  // Any console error fails the test: a blocked script, a React warning, a crash.
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          if (!/Failed to load resource|net::ERR/.test(message.text())) {
            problems.push(message.text());
          }
        }
      });
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** A row by its exact title. */
export const row = (page: Page, title: string): Locator =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) });

/** A freshly deleted or renamed thing is searched by name, so rows are opened one by one. */
export async function expand(page: Page, ...titles: string[]) {
  for (const title of titles) {
    await row(page, title).getByRole('button', { name: 'Развернуть', exact: true }).click();
  }
}

export const panel = (page: Page): Locator => page.getByRole('complementary');
