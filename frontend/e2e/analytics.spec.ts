import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, panel, row, test } from './fixtures';

const card = (page: Page, title: string | RegExp): Locator =>
  page.getByRole('region', { name: title });

const tile = (page: Page, name: string): Locator =>
  page.locator('dl > div').filter({ has: page.getByText(name, { exact: true }) });

async function openAnalytics(page: Page) {
  await page.getByRole('link', { name: 'Аналитика' }).click();
  await expect(card(page, 'Где фокус и где его не хватает')).toBeVisible();
}

test('numbers of the last 30 days', async ({ page, orbit }) => {
  await openAnalytics(page);
  const stats = orbit.cli('stats') as { totals: Record<string, { value: number }> };
  await expect(tile(page, 'Сессии Claude')).toContainText(String(stats.totals.sessions?.value));
  await expect(tile(page, 'Коммиты')).toContainText(String(stats.totals.commits?.value));
  await expect(tile(page, 'Закрыто задач')).toContainText(String(stats.totals.closed?.value));
  await expect(page.locator('p', { hasText: /^Основной фокус/ })).toContainText(
    'Coffee Shop Sales Dashboard',
  );
  await expect(card(page, '3 срока прошли')).toContainText('Window functions');
});

test('little data is said, not drawn', async ({ page, orbit: _ }) => {
  await openAnalytics(page);
  const cycle = card(page, 'Cycle time: данных пока мало');
  await expect(cycle).toContainText('Известно начало у 3 из нужных 10');
  await expect(cycle).toContainText('Не вошли: 7 закрыты без статуса "в работе"');
  await expect(tile(page, 'Коммиты')).toContainText('сравнить не с чем');
});

test('period and project live in the address and survive a reload', async ({ page, orbit: _ }) => {
  await openAnalytics(page);
  await page.getByRole('button', { name: '7 дней' }).click();
  await expect(page).toHaveURL(/period=7d$/);
  await expect(tile(page, 'Сессии Claude')).toContainText(/^Сессии Claude2/);

  await page.getByRole('button', { name: /^Проект:/ }).click();
  await page.getByRole('menuitemradio', { name: 'SQL Interview Practice' }).click();
  await expect(page.getByText(/^SQL Interview Practice: /)).toBeVisible();
  await expect(card(page, 'Где фокус')).not.toContainText('Coffee');

  await page.reload();
  await expect(page.getByRole('button', { name: '7 дней' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(page, 'Где фокус')).not.toContainText('Coffee');

  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.getByRole('button', { name: '30 дней' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(page, 'Где фокус')).toContainText('Coffee');
  expect(new URL(page.url()).search).toBe('?screen=analytics');
});

test('own dates are picked in the calendar, in any order', async ({ page, orbit: _ }) => {
  await openAnalytics(page);
  await page.getByRole('button', { name: 'Свои даты' }).click();
  const days = page
    .getByRole('dialog')
    .getByRole('gridcell')
    .getByRole('button', { disabled: false });
  await days.nth(3).click();
  await expect(page.getByText('Теперь последний день')).toBeVisible();
  await days.nth(1).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const url = new URL(page.url());
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  expect(Date.parse(to) - Date.parse(from)).toBe(2 * 86_400_000);
  await expect(page.getByRole('button', { name: 'Свои даты' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(page, 'Где фокус')).toBeVisible();
});

test('a broken address opens the usual period', async ({ page, orbit }) => {
  await page.goto(`${orbit.url}/?screen=analytics&period=5000&from=2026-13-01&to=x`);
  await expect(page.getByRole('button', { name: '30 дней' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(page, 'Где фокус')).toBeVisible();
});

test('an unknown project says so and offers a way out', async ({ page, orbit }) => {
  await page.goto(`${orbit.url}/?screen=analytics&project=nope`);
  await expect(page.getByText('Не получилось посчитать')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(card(page, 'Где фокус')).toBeVisible();
});

test('changes from the terminal appear by themselves', async ({ page, orbit }) => {
  await openAnalytics(page);
  const before = await tile(page, 'Закрыто задач').textContent();
  const [task] = orbit.cli('task', 'list', 'reading-list') as { id: number }[];
  orbit.cli('set', 'task', String(task?.id), '--status', 'done', '--force');
  await expect(tile(page, 'Закрыто задач')).not.toHaveText(before ?? '');
});

test('a row of a chart opens its panel', async ({ page, orbit: _ }) => {
  await openAnalytics(page);
  await card(page, '3 срока прошли')
    .getByRole('button', { name: /LAG\/LEAD/ })
    .click();
  await expect(panel(page)).toContainText('LAG/LEAD for retention');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await card(page, 'Где фокус').getByRole('button', { name: 'SQL Interview Practice' }).click();
  await expect(panel(page)).toContainText('SQL Interview Practice');
});

test('keys, palette and the project filter are shared with other screens', async ({
  page,
  orbit: _,
}) => {
  await row(page, 'Reading List').waitFor();
  await page.keyboard.press('a');
  await expect(card(page, 'Где фокус')).toBeVisible();
  await page.keyboard.press('g');
  await expect(page.getByRole('columnheader', { name: 'Время' })).toBeVisible();
  await page.keyboard.press('a');
  await page.getByRole('button', { name: /^Проект:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Reading List' }).click();
  await page.keyboard.press('a');
  await expect(row(page, 'Reading List')).toBeVisible();
  await expect(row(page, 'SQL Interview Practice')).toBeHidden();

  await page.keyboard.press('Control+k');
  await page.keyboard.type('дашборд');
  await page.keyboard.press('Enter');
  await expect(card(page, 'Где фокус')).toBeVisible();
});

test('commits instead of sessions, remembered', async ({ page, orbit: _ }) => {
  await openAnalytics(page);
  const heat = card(page, /^Больше всего/);
  await expect(heat).toContainText('сесси');
  await heat.getByRole('button', { name: 'Коммиты' }).click();
  await expect(heat).toContainText('коммит');
  await page.reload();
  await expect(
    card(page, /^Больше всего/).getByRole('button', { name: 'Коммиты' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('a hint under the pointer repeats the number', async ({ page, orbit: _ }) => {
  await openAnalytics(page);
  const cell = card(page, /^Больше всего/)
    .getByRole('cell')
    .first();
  await cell.hover();
  await expect(page.locator('[data-tip] >> nth=0')).toBeAttached();
  await expect(page.getByText(/Coffee Shop Sales Dashboard\n/)).toBeVisible();
});

test('hostile names stay text', async ({ page, orbit }) => {
  const evil = '<img src=x onerror="document.title=1">';
  orbit.cli('project', 'add', 'evil', '--name', evil, '--status', 'in_progress');
  await openAnalytics(page);
  await expect(card(page, 'Где фокус')).toContainText(evil);
  await expect(page).toHaveTitle('Orbit');
});

test('an empty database says what is missing everywhere', async ({ page, orbit }) => {
  for (const p of orbit.cli('project', 'list') as { slug: string }[]) {
    orbit.cli('project', 'archive', p.slug);
  }
  await page.goto(`${orbit.url}/?screen=analytics&from=2020-01-01&to=2020-01-31`);
  await expect(page.getByText('За этот период нет ни сессий, ни коммитов.')).toBeVisible();
  await expect(page.getByText('Ни один проект не в работе, и за период')).toBeVisible();
  await expect(card(page, 'На две недели сроков нет')).toBeVisible();
  await expect(card(page, 'Cycle time: считать не на чем')).toBeVisible();
  await expect(card(page, 'План и факт: сравнивать нечего')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('charts, filters and how it is counted', async ({ page, orbit: _ }) => {
      await openAnalytics(page);
      const violations = async () => {
        await page.waitForTimeout(400);
        const found = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        return found.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`,
        );
      };
      expect(await violations()).toEqual([]);
      for (const summary of await page.getByText('Как посчитано').all()) await summary.click();
      await page.getByRole('button', { name: 'Все время' }).click();
      expect(await violations()).toEqual([]);
      await page.getByRole('button', { name: 'Свои даты' }).click();
      expect(await violations()).toEqual([]);
    });
  });
}

for (const width of [360, 768, 1024, 1920]) {
  test(`nothing sticks out sideways at ${width} px`, async ({ page, orbit }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const query of ['', '&period=all', '&period=7']) {
      await page.goto(`${orbit.url}/?screen=analytics${query}`);
      await expect(card(page, 'Где фокус')).toBeVisible();
      const wide = await page.evaluate(() => {
        const body = document.documentElement;
        const spill = [...document.querySelectorAll('main section, main dl > div')].filter(
          (box) => box.scrollWidth > box.clientWidth + 1 && !box.matches('[tabindex]'),
        );
        return [
          body.scrollWidth > body.clientWidth ? 'page' : '',
          ...spill.map((box) => box.textContent?.slice(0, 40) ?? ''),
        ].filter(Boolean);
      });
      expect(wide).toEqual([]);
    }
  });
}
