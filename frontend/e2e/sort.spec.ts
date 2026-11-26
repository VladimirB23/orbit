import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Keys of the projects in the order they are on the screen. */
const projects = (page: Page) =>
  page
    .locator('[role=treegrid] [role=row][data-key^="project-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-key')));

const header = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });

const later = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

test('a click on a field orders the rows, the next one reverses, the third returns', async ({
  page,
  orbit,
}) => {
  // With a folder: a project without one is a future one and stays at the end.
  const add = (slug: string, name: string, due: string) =>
    orbit.cli(
      'project',
      'add',
      slug,
      '--name',
      name,
      '--due',
      due,
      '--repo',
      `D:/Projects/${slug}`,
    );
  add('far', 'Far away', '2099-01-01');
  add('near', 'Near', later(1));
  await expect(page.getByRole('button', { name: 'Near', exact: true })).toBeVisible();
  const usual = await projects(page);
  const keyOf = (name: string) =>
    page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name, exact: true }) })
      .getAttribute('data-key');
  const nearKey = await keyOf('Near');
  const farKey = await keyOf('Far away');
  const future = usual.at(-1);

  await header(page, 'Срок').getByRole('button').click();
  await expect(header(page, 'Срок')).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(() => projects(page).then((keys) => keys[0])).toBe(nearKey);
  const ascending = await projects(page);
  // The demo has one project with a deadline, a week or so ahead: between the two.
  expect(ascending.indexOf(farKey)).toBe(2);
  expect(ascending.at(-1)).toBe(future);

  await header(page, 'Срок').getByRole('button').click();
  await expect(header(page, 'Срок')).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(() => projects(page).then((keys) => keys[0])).toBe(farKey);
  expect((await projects(page)).at(-1)).toBe(future);

  await page.reload();
  await expect(header(page, 'Срок')).toHaveAttribute('aria-sort', 'descending');

  await header(page, 'Срок').getByRole('button').click();
  await expect(header(page, 'Срок')).not.toHaveAttribute('aria-sort');
  await expect.poll(() => projects(page)).toEqual(usual);
});

test('the timeline has the same order and a menu for it', async ({ page, orbit: _ }) => {
  const usual = await projects(page);
  await page.getByRole('link', { name: 'Таймлайн' }).click();
  await page.getByRole('button', { name: 'Порядок' }).click();
  await page.getByRole('menuitemradio', { name: 'Приоритет' }).click();
  await page.getByRole('menuitemradio', { name: 'сначала низкий' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Приоритет' })).toBeVisible();
  const lowFirst = await projects(page);
  expect(lowFirst).not.toEqual(usual);
  expect(lowFirst.at(-1)).toBe(usual.at(-1));

  await page.getByRole('button', { name: 'Приоритет' }).click();
  await page.getByRole('menuitemradio', { name: 'Обычный порядок' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => projects(page)).toEqual(usual);
});
