// A project without a folder is a future one: it stays apart and nothing is asked of it.
import type { Page } from '@playwright/test';
import { expect, panel, row, test } from './fixtures';

const open = (page: Page, title: string) =>
  row(page, title).getByRole('button', { name: title, exact: true }).click();
const heading = (page: Page) => page.getByRole('row').filter({ hasText: 'Будущие проекты' });

test('future projects stay apart, a folder lifts one up with its history', async ({
  page,
  orbit,
}) => {
  await expect(heading(page)).toContainText('1');
  await open(page, 'Reading List');
  await expect(panel(page)).toContainText('Будущий проект: папки еще нет');

  orbit.cli('set', 'project', 'reading-list', '--repo', 'D:\\Projects\\reading-list');
  await expect(heading(page)).toHaveCount(0);
  await expect(panel(page)).not.toContainText('Будущий проект');
  await expect(panel(page)).toContainText('D:\\Projects\\reading-list');
  expect(orbit.cli('task', 'list', 'reading-list')).toHaveLength(3);
});

test('the heading is on the timeline too', async ({ page, orbit }) => {
  await page.goto(`${orbit.url}/?screen=timeline`);
  await expect(heading(page)).toBeVisible();
});

test('a session held in one project can be about another', async ({ page, orbit: _ }) => {
  await open(page, 'SQL Interview Practice');
  const sessions = panel(page).getByLabel('Сессии Claude');
  const first = sessions.getByRole('listitem').filter({ hasText: 'Retention with LAG and LEAD' });
  await first.getByRole('button', { name: /^О чем сессия/ }).click();
  await page.getByRole('menuitemradio', { name: 'Reading List' }).click();
  await expect(first).toContainText('будущий проект: Reading List');

  await open(page, 'Reading List');
  await expect(sessions.getByRole('listitem')).toHaveCount(1);
  await expect(sessions).toContainText('обсуждали здесь: SQL Interview Practice');

  // Taken back the same way.
  await sessions.getByRole('button', { name: /^О чем сессия/ }).click();
  await page.getByRole('menuitemradio', { name: 'SQL Interview Practice' }).click();
  await expect(sessions).toBeHidden();
});

test('analytics asks nothing of a future project', async ({ page, orbit }) => {
  orbit.cli('set', 'project', 'reading-list', '--status', 'in_progress', '--priority', '4');
  await page.goto(`${orbit.url}/?screen=analytics`);
  const card = page.getByRole('region', { name: /Где фокус/ });
  await expect(card).toContainText('Будущие проекты, внимания пока не ждут: Reading List');
  await expect(card.getByRole('row').filter({ hasText: 'Reading List' })).toHaveCount(0);

  const [session] = orbit.cli('session', 'list', 'sql-practice') as { external_id: string }[];
  orbit.cli('session', 'about', session?.external_id ?? '', 'reading-list');
  await expect(card.getByRole('row').filter({ hasText: 'Reading List' })).toContainText(
    'будущий проект',
  );
});
