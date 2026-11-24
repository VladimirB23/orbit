import { expect, panel, row, test } from './fixtures';

test('a counter shows exactly as many matches as it promises', async ({ page, orbit: _ }) => {
  const counter = page.getByRole('button', { name: /^Просрочено/ });
  const promised = Number(((await counter.textContent()) ?? '').match(/\d+/)?.[0]);
  await counter.click();
  await expect(counter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('row').locator('time + .sr-only')).toHaveCount(promised);
  await counter.click();
  await expect(row(page, 'Reading List')).toBeVisible();
});

test('search finds a task inside folded branches', async ({ page, orbit: _ }) => {
  await page.getByRole('searchbox').fill('retention');
  await expect(row(page, 'LAG/LEAD for retention')).toBeVisible();
  await expect(row(page, 'Reading List')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(row(page, 'Reading List')).toBeVisible();
  await expect(row(page, 'LAG/LEAD for retention')).toBeHidden();
});

test('filters and the open panel survive a reload, Back closes the panel', async ({
  page,
  orbit: _,
}) => {
  await page.getByRole('button', { name: /^Просрочено/ }).click();
  await row(page, 'LAG/LEAD for retention')
    .getByRole('button', { name: 'LAG/LEAD for retention', exact: true })
    .click();
  await expect(panel(page)).toBeVisible();
  await page.reload();
  await expect(panel(page)).toContainText('LAG/LEAD for retention');
  await expect(row(page, 'Reading List')).toBeHidden();
  await page.goBack();
  await expect(panel(page)).toBeHidden();
  await expect(row(page, 'LAG/LEAD for retention')).toBeVisible();
});

test('nothing found: says so and offers a way out', async ({ page, orbit: _ }) => {
  await page.getByRole('searchbox').fill('zzzz');
  await expect(page.getByText('Ничего не нашлось')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(row(page, 'Reading List')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

test('several statuses at once, then the archive', async ({ page, orbit: _ }) => {
  await page.getByRole('button', { name: 'Фильтр' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Заблокировано' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'На паузе' }).click();
  await page.keyboard.press('Escape');
  await expect(row(page, 'Home Budget Tracker')).toBeVisible();
  await expect(row(page, 'Reading List')).toBeHidden();
  await page.getByRole('button', { name: 'Сбросить' }).click();

  await page.getByRole('button', { name: 'Фильтр' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Показать архив' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('в архиве')).toBeVisible();
});

test('expanded branches are remembered between visits', async ({ page, orbit: _ }) => {
  await row(page, 'SQL Interview Practice').focus();
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 'Mock interview')).toBeVisible();
  await page.reload();
  await expect(row(page, 'Mock interview')).toBeVisible();
});

test('rows do not jump when the panel opens', async ({ page, orbit: _ }) => {
  const last = row(page, 'Reading List');
  const before = await last.boundingBox();
  await row(page, 'SQL Interview Practice')
    .getByRole('button', { name: 'SQL Interview Practice', exact: true })
    .click();
  await expect(panel(page)).toBeVisible();
  expect((await last.boundingBox())?.y).toBe(before?.y);
});

test('a broken address opens the usual tree', async ({ page, orbit }) => {
  await page.goto(`${orbit.url}/?view=nope&status=x&archived=5&item=%3Cb%3E`);
  await expect(row(page, 'Reading List')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сбросить' })).toBeHidden();
});
