import { expect, panel, row, test } from './fixtures';

test('arrows walk the tree: open, go in, go to the parent, fold', async ({ page, orbit: _ }) => {
  await row(page, 'SQL Interview Practice').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 'Joins and aggregates')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row(page, 'SQL Interview Practice')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row(page, 'Joins and aggregates')).toBeHidden();
  await page.keyboard.press('End');
  await expect(row(page, 'Reading List')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(row(page, 'Coffee Shop Sales Dashboard')).toBeFocused();
});

test('the panel follows the arrows, Escape closes it and returns to the row', async ({
  page,
  orbit: _,
}) => {
  await row(page, 'SQL Interview Practice').focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toContainText('sql-practice');
  await page.keyboard.press('ArrowDown');
  await expect(panel(page)).toContainText('Home Budget Tracker');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(row(page, 'Home Budget Tracker')).toBeFocused();
});

test('after a menu or a calendar arrows move between rows again', async ({ page, orbit: _ }) => {
  for (const key of ['s', 'd']) {
    await row(page, 'SQL Interview Practice').focus();
    await page.keyboard.press(key);
    await expect(page.locator('[role=menu], [role=dialog]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(row(page, 'SQL Interview Practice')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'Home Budget Tracker')).toBeFocused();
  }
});

test('shortcuts work in the Russian layout', async ({ page, orbit: _ }) => {
  await row(page, 'Reading List').focus();
  await page.evaluate(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ы', code: 'KeyS', bubbles: true, cancelable: true }),
    ),
  );
  await expect(page.getByRole('menuitemradio', { name: 'В работе' })).toBeVisible();
});

test('letters typed into a field are only text', async ({ page, orbit: _ }) => {
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.type('spn');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('searchbox')).toHaveValue('spn');
});

test('Tab enters the tree once instead of walking every row', async ({ page, orbit: _ }) => {
  const stops = page.getByRole('treegrid').locator('[role=row][tabindex="0"]');
  await expect(stops).toHaveCount(1);
});

test('the list of shortcuts opens by the question mark', async ({ page, orbit: _ }) => {
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog', { name: 'Горячие клавиши' })).toBeVisible();
});

test('Enter on a button presses the button, not the row', async ({ page, orbit: _ }) => {
  const target = row(page, 'Reading List');
  await target.focus();
  await target.getByRole('button', { name: /^Статус/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(panel(page)).toBeHidden();
});
