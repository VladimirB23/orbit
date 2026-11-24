import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, panel, row, test } from './fixtures';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Найти или открыть' });
const option = (page: Page, name: string | RegExp) => palette(page).getByRole('option', { name });

test('finds a task in a folded branch, opens it and gives it the focus', async ({
  page,
  orbit: _,
}) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('lag');
  await expect(option(page, /LAG\/LEAD for retention/)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
  await expect(row(page, 'LAG/LEAD for retention')).toBeFocused();
  await expect(panel(page)).toContainText('LAG/LEAD for retention');
});

test('a filter that hides the row is dropped, Back returns it', async ({ page, orbit: _ }) => {
  await page.getByRole('button', { name: /^Заблокировано/ }).click();
  await expect(row(page, 'Reading List')).toBeHidden();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('reading');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Reading List')).toBeFocused();
  await page.goBack();
  await expect(row(page, 'Reading List')).toBeHidden();
});

test('works from inside a field and returns to it on Escape', async ({ page, orbit: _ }) => {
  await page.getByRole('searchbox').focus();
  await page.keyboard.press('Control+k');
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole('searchbox')).toBeFocused();
});

test('the Russian layout is not an obstacle', async ({ page, orbit: _ }) => {
  await page.evaluate(() =>
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'л',
        code: 'KeyK',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await palette(page).getByRole('combobox').fill('куфвштп');
  await expect(option(page, 'Reading List').first()).toBeVisible();
});

test('arrows choose, the mouse chooses too', async ({ page, orbit: _ }) => {
  await page.keyboard.press('Control+k');
  const chosen = palette(page).locator('[role=option][aria-selected=true]');
  await expect(chosen).toContainText('Coffee Shop Sales Dashboard');
  await page.keyboard.press('ArrowDown');
  await expect(chosen).toContainText('SQL Interview Practice');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(chosen).toContainText('Coffee Shop Sales Dashboard');
  await option(page, 'Reading List').first().click();
  await expect(panel(page)).toContainText('reading-list');
});

test('opens the folder of the project that is open now', async ({ page, orbit: _ }) => {
  await page.evaluate(() => {
    const opened: string[] = [];
    Object.assign(window, { opened });
    HTMLAnchorElement.prototype.click = function click() {
      opened.push(this.href);
    };
  });
  await row(page, 'SQL Interview Practice').focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(option(page, /Открыть в VS Code: SQL Interview Practice/)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
    'vscode://file/D:/Projects/sql-practice?windowId=_blank',
  ]);
});

test('runs commands: new project, views, help', async ({ page, orbit: _ }) => {
  const run = async (text: string) => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  await run('новый проект');
  await expect(page.getByRole('textbox', { name: 'Название' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await run('показать заблок');
  await expect(page.getByRole('button', { name: /^Заблокировано/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await run('горячие');
  await expect(page.getByRole('dialog', { name: 'Горячие клавиши' })).toBeVisible();
});

test('never covers another dialog', async ({ page, orbit: _ }) => {
  await page.getByRole('button', { name: 'Новый проект' }).click();
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeHidden();
});

test('nothing found is said, Enter does nothing', async ({ page, orbit: _ }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zzzz qqqq');
  await expect(palette(page)).toContainText('Ничего не нашлось');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    test.use({ colorScheme });
    test('palette', async ({ page, orbit: _ }) => {
      await page.keyboard.press('Control+k');
      await page.keyboard.type('a');
      await expect(palette(page).getByRole('option').first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
  });
}
