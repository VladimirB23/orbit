import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expand, expect, panel, row, test } from './fixtures';

const COFFEE = 'Coffee Shop Sales Dashboard';
const VSCODE = 'vscode://file/D:/Projects/coffee-dashboard?windowId=_blank';
const NOTE =
  'obsidian://open?vault=Study%20vault&file=Inbox%2Fcoffee-dashboard%2F0.%20coffee-dashboard%20-%20Overview.md';

const openPanel = (page: Page, title: string) =>
  row(page, title).getByRole('button', { name: title, exact: true }).click();

/** Other programs must not start during a test: the addresses are collected instead. */
async function catchExternal(page: Page) {
  await page.evaluate(() => {
    const opened: string[] = [];
    Object.assign(window, { opened });
    HTMLAnchorElement.prototype.click = function click() {
      opened.push(this.href);
    };
  });
  return () => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
}

test('the folder of a project is in sight and opens in VS Code', async ({ page, orbit: _ }) => {
  const link = row(page, COFFEE).getByRole('link', { name: /Открыть в VS Code/ });
  await expect(link).toHaveText('D:\\Projects\\coffee-dashboard');
  await expect(link).toHaveAttribute('href', VSCODE);
  await expect(row(page, 'Reading List').getByRole('link')).toHaveCount(0);
});

test('the panel of a project and of a task inside lead to the same places', async ({
  page,
  orbit: _,
}) => {
  await openPanel(page, COFFEE);
  const places = panel(page).getByLabel('Где лежит проект');
  await expect(places).toContainText('D:\\Projects\\coffee-dashboard');
  await expect(places.getByRole('link', { name: 'Открыть в VS Code' })).toHaveAttribute(
    'href',
    VSCODE,
  );
  await expect(places.getByRole('link', { name: 'Заметка в Obsidian' })).toHaveAttribute(
    'href',
    NOTE,
  );

  await expand(page, COFFEE, 'KPI design');
  await openPanel(page, 'Revenue per hour');
  await expect(panel(page)).toContainText('Revenue per hour');
  await expect(places.getByRole('link', { name: 'Открыть в VS Code' })).toHaveAttribute(
    'href',
    VSCODE,
  );
});

test('the path is copied with one press', async ({ page, context, orbit: _ }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPanel(page, COFFEE);
  await panel(page).getByRole('button', { name: 'Скопировать адрес папки' }).click();
  await expect(panel(page).getByText('Скопировано')).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'D:\\Projects\\coffee-dashboard',
  );
});

test('O opens the folder and Shift+O the note, from any row of the project', async ({
  page,
  orbit: _,
}) => {
  const opened = await catchExternal(page);
  await expand(page, COFFEE);
  await row(page, 'KPI design').focus();
  await page.keyboard.press('o');
  await page.keyboard.press('Shift+O');
  expect(await opened()).toEqual([VSCODE, NOTE]);

  await row(page, 'Reading List').focus();
  await page.keyboard.press('o');
  await expect(page.getByText('У проекта не указана папка')).toBeVisible();
});

test('the row menu opens and copies', async ({ page, orbit: _ }) => {
  const opened = await catchExternal(page);
  await row(page, COFFEE).hover();
  await page.getByRole('button', { name: `Действия: ${COFFEE}` }).click();
  await page.getByRole('menuitem', { name: /Открыть в VS Code/ }).click();
  expect(await opened()).toEqual([VSCODE]);
});

test('a new folder from the terminal appears as a link', async ({ page, orbit }) => {
  orbit.cli('set', 'project', 'reading-list', '--repo', 'd:/Projects/reading list');
  await expect(row(page, 'Reading List').getByRole('link')).toHaveAttribute(
    'href',
    'vscode://file/D:/Projects/reading%20list?windowId=_blank',
    { timeout: 2000 },
  );
});

test('dangerous paths never become links', async ({ page, orbit }) => {
  for (const [slug, repo] of [
    ['evil-js', 'javascript:document.title=1'],
    ['evil-share', '\\\\evil\\share'],
  ] as const) {
    orbit.cli('project', 'add', slug, '--name', slug, '--repo', repo);
    await expect(row(page, slug)).toBeVisible();
    await expect(row(page, slug).getByRole('link')).toHaveCount(0);
    await openPanel(page, slug);
    await expect(panel(page)).toContainText(slug);
    await expect(panel(page).getByRole('link')).toHaveCount(0);
  }
});

test('sessions: the latest first, the rest on demand, a command to continue', async ({
  page,
  context,
  orbit: _,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPanel(page, COFFEE);
  const sessions = panel(page).getByLabel('Сессии Claude');
  await expect(sessions.getByRole('listitem')).toHaveCount(3);
  await expect(sessions.getByRole('listitem').first()).toContainText('Loyalty export');
  await sessions.getByRole('button', { name: 'Показать все (5)' }).click();
  await expect(sessions.getByRole('listitem')).toHaveCount(5);

  await sessions.getByRole('button', { name: /продолжить: Loyalty export/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^cd 'D:\\Projects\\coffee-dashboard'; claude --resume [0-9a-f-]{36}$/,
  );
});

test('a journal written while the server runs reaches the open panel', async ({ page, orbit }) => {
  await openPanel(page, 'Home Budget Tracker');
  await expect(panel(page).getByLabel('Сессии Claude')).toBeHidden();

  const folder = join(orbit.vault, 'Inbox', 'home-budget');
  mkdirSync(folder, { recursive: true });
  const id = 'a1b2c3d4-0000-4000-8000-000000000001';
  writeFileSync(
    join(folder, 'Журнал сессий.md'),
    [
      '<!-- log:start -->',
      `<!-- session:${id} -->`,
      '### 2026-11-24 15:04–17:15 · Budget categories',
      '- **Реплик:** 4 · **Файлы:** `a.py`',
      '- Папка `D:\\Projects\\home-budget` · продолжить',
      '<!-- log:end -->',
    ].join('\n'),
  );
  await expect(panel(page).getByLabel('Сессии Claude')).toContainText('Budget categories', {
    timeout: 20_000,
  });
  await expect(panel(page).getByLabel('Сессии Claude')).toContainText('4 реплики, 1 файл');
});
