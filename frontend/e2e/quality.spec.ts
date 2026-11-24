import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expand, expect, panel, row, test } from './fixtures';

async function violations(page: Page) {
  await page.waitForTimeout(400); // animations change contrast while they run
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('tree, panel and filters', async ({ page, orbit: _ }) => {
      await expand(page, 'Coffee Shop Sales Dashboard', 'KPI design');
      expect(await violations(page)).toEqual([]);
      await row(page, 'SQL Interview Practice')
        .getByRole('button', { name: 'SQL Interview Practice', exact: true })
        .click();
      await expect(panel(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: /^Просрочено/ }).click();
      expect(await violations(page)).toEqual([]);
    });

    test('dialogs', async ({ page, orbit: _ }) => {
      await page.getByRole('button', { name: 'Новый проект' }).click();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+Slash');
      expect(await violations(page)).toEqual([]);
    });
  });
}

test('hostile data stays text: no markup, no script links', async ({ page, orbit }) => {
  const evil = '<img src=x onerror="document.title=1">';
  orbit.cli('project', 'add', 'evil', '--name', evil, '--github', 'javascript:document.title=1');
  await expect(row(page, evil)).toBeVisible();
  await row(page, evil).getByRole('button', { name: evil, exact: true }).click();
  await expect(panel(page)).toContainText(evil);
  await expect(panel(page).getByRole('link')).toHaveCount(0);
  await expect(page).toHaveTitle('Orbit');
});

test('the page talks only to its own server', async ({ page, orbit }) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(orbit.url)) foreign.push(request.url());
  });
  await page.reload();
  await row(page, 'Reading List').waitFor();
  expect(foreign).toEqual([]);
});

test('theme choice is remembered and applied before the first paint', async ({
  page,
  orbit: _,
}) => {
  await page.getByRole('button', { name: 'Тема' }).click();
  await page.getByRole('menuitemradio', { name: 'Темная' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveClass('dark');
});

for (const width of [360, 768, 1024, 1920]) {
  test(`nothing sticks out sideways at ${width} px`, async ({ page, orbit: _ }) => {
    await page.setViewportSize({ width, height: 800 });
    await row(page, 'SQL Interview Practice').focus();
    await page.keyboard.press('ArrowRight');
    const tooWide = await page.evaluate(() => {
      const tree = document.querySelector('.tree');
      return (
        document.documentElement.scrollWidth > document.documentElement.clientWidth ||
        (tree !== null && tree.scrollWidth > tree.clientWidth)
      );
    });
    expect(tooWide).toBe(false);
  });
}
