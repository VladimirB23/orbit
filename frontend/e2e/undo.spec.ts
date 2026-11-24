import { expand, expect, panel, row, test } from './fixtures';

// The server of the tests belongs to the interface, so its changes are Vladimir's.

test('Ctrl+Z takes back a status, Ctrl+Shift+Z returns it', async ({ page, orbit: _ }) => {
  const target = row(page, 'Reading List');
  await target.getByRole('button', { name: /^Статус/ }).click();
  await page.getByRole('menuitemradio', { name: 'В работе' }).click();
  await expect(target.getByRole('button', { name: 'Статус: В работе' })).toBeVisible();
  await expect(target).toBeFocused();

  await page.keyboard.press('Control+z');
  await expect(target.getByRole('button', { name: 'Статус: Идея' })).toBeVisible();
  await expect(page.getByText('Отменено: статус, «Reading List»')).toBeVisible();

  await page.keyboard.press('Control+Shift+z');
  await expect(target.getByRole('button', { name: 'Статус: В работе' })).toBeVisible();
  await expect(page.getByText('Возвращено: статус, «Reading List»')).toBeVisible();
});

test('several steps back, also after a reload', async ({ page, orbit: _ }) => {
  await row(page, 'Reading List').focus();
  for (const name of ['Books', 'Library']) {
    await page.keyboard.press('F2');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await expect(row(page, name)).toBeFocused();
  }
  await page.reload();
  await expect(row(page, 'Library')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(row(page, 'Books')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(row(page, 'Reading List')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Отменять нечего')).toBeVisible();
});

test('a deleted milestone returns with everything inside', async ({ page, orbit }) => {
  const before = orbit.cli('tree', 'sql-practice');
  await expand(page, 'SQL Interview Practice');
  await row(page, 'Window functions').focus();
  await page.keyboard.press('Delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(row(page, 'Window functions')).toBeHidden();

  await page.keyboard.press('Control+z');
  await expect(row(page, 'Window functions')).toBeVisible();
  await expect(page.getByText('удаление «Window functions» и все внутри (4)')).toBeVisible();
  await expand(page, 'Window functions');
  await expect(row(page, 'LAG/LEAD for retention')).toBeVisible();
  const strip = (tree: unknown) =>
    JSON.stringify(tree).replaceAll(/"updated_at":"[^"]*"/g, '"updated_at":""');
  expect(strip(orbit.cli('tree', 'sql-practice'))).toBe(strip(before));
});

test('an added task disappears, the open panel closes with it', async ({ page, orbit: _ }) => {
  await row(page, 'Reading List').focus();
  await page.keyboard.press('n');
  await page.keyboard.type('Extra');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Extra')).toBeVisible();
  await page.keyboard.press('Escape');
  await row(page, 'Extra').getByRole('button', { name: 'Extra', exact: true }).click();
  await expect(panel(page)).toContainText('Extra');
  await page.keyboard.press('Control+z');
  await expect(row(page, 'Extra')).toBeHidden();
  await expect(panel(page)).toBeHidden();
});

test('in a field Ctrl+Z takes back only typing', async ({ page, orbit: _ }) => {
  await row(page, 'Reading List')
    .getByRole('button', { name: /^Статус/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'В работе' }).click();
  await expect(row(page, 'Reading List')).toBeFocused();
  await page.keyboard.press('/');
  await page.keyboard.type('read');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await expect(
    row(page, 'Reading List').getByRole('button', { name: 'Статус: В работе' }),
  ).toBeVisible();
});

test('what Claude has changed since is not overwritten', async ({ page, orbit }) => {
  const target = row(page, 'Reading List');
  await target.getByRole('button', { name: /^Статус/ }).click();
  await page.getByRole('menuitemradio', { name: 'В работе' }).click();
  await expect(target).toBeFocused();
  orbit.cli('set', 'project', 'reading-list', '--status', 'blocked');
  await expect(target.getByRole('button', { name: 'Статус: Заблокировано' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Не отменено: после этого пункт уже изменили')).toBeVisible();
  await expect(target.getByRole('button', { name: 'Статус: Заблокировано' })).toBeVisible();
});

test('on the timeline keys not saved yet are just forgotten', async ({ page, orbit }) => {
  const before = orbit.cli('milestone', 'list', 'coffee-dashboard');
  await page.keyboard.press('g');
  await expand(page, 'Coffee Shop Sales Dashboard');
  await row(page, 'Tableau dashboard').focus();
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  expect(orbit.cli('milestone', 'list', 'coffee-dashboard')).toEqual(before);

  await page.keyboard.press(']');
  await expect.poll(() => orbit.cli('milestone', 'list', 'coffee-dashboard')).not.toEqual(before);
  await page.keyboard.press('Control+z');
  const due = (list: { name: string; due_date: string }[]) => list.map((m) => [m.name, m.due_date]);
  await expect
    .poll(() => due(orbit.cli('milestone', 'list', 'coffee-dashboard')))
    .toEqual(due(before));
});
