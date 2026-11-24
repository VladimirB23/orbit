import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expand, expect, panel, row, test } from './fixtures';

const DAY = 20; // pixels in a day at the "weeks" zoom

const bar = (page: Page, title: string): Locator =>
  page.getByRole('treegrid').getByRole('button', { name: new RegExp(`^${title}: `) });

const grip = (page: Page, title: string, side: 'start' | 'end'): Locator =>
  bar(page, title).locator('..').locator(`[data-grip=${side}]`);

async function openTimeline(page: Page) {
  await page.getByRole('link', { name: 'Таймлайн' }).click();
  await expect(page.getByRole('columnheader', { name: 'Время' })).toBeVisible();
}

/** Pulls from the middle of an element by whole days; `drop: false` keeps the button pressed. */
async function pull(page: Page, from: Locator, days: number, drop = true) {
  await from.hover();
  const box = await from.boundingBox();
  if (!box) throw new Error('nothing to pull');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (days * DAY) / 2, y, { steps: 4 });
  await page.mouse.move(x + days * DAY, y, { steps: 4 });
  if (drop) await page.mouse.up();
}

type Cli = (...args: string[]) => unknown;
interface Dated {
  id: number;
  name: string;
  start_date: string | null;
  due_date: string | null;
}

function milestone(cli: Cli, project: string, name: string): Dated {
  const list = cli('milestone', 'list', project) as Dated[];
  const found = list.find((m) => m.name === name);
  if (!found) throw new Error(`no milestone ${name}`);
  return found;
}

const plus = (day: string | null, days: number) =>
  new Date(Date.parse(`${day}T00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

test('the same rows on a time scale: filters and the open panel stay', async ({
  page,
  orbit: _,
}) => {
  await page.getByRole('button', { name: /^Просрочено/ }).click();
  await openTimeline(page);
  await expect(row(page, 'Window functions')).toBeVisible();
  await expect(row(page, 'Reading List')).toBeHidden();
  await bar(page, 'Window functions').click();
  await expect(panel(page)).toContainText('Window functions');

  await page.keyboard.press('g');
  await expect(page.getByRole('columnheader', { name: 'Статус' })).toBeVisible();
  await expect(panel(page)).toContainText('Window functions');
  await page.goBack();
  await expect(page.getByRole('columnheader', { name: 'Время' })).toBeVisible();
  await page.reload();
  await expect(bar(page, 'Window functions')).toBeVisible();
});

test('a folded project shows its milestones, an open one its own bar', async ({
  page,
  orbit: _,
}) => {
  await openTimeline(page);
  await expect(bar(page, 'KPI design')).toBeVisible();
  await expect(bar(page, 'Coffee Shop Sales Dashboard')).toBeHidden();
  await expand(page, 'Coffee Shop Sales Dashboard');
  await expect(bar(page, 'Coffee Shop Sales Dashboard')).toBeVisible();
  await expect(bar(page, 'KPI design')).toBeVisible();
});

test('the right end sets the deadline, the toast brings it back', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await openTimeline(page);
  await expand(page, 'Coffee Shop Sales Dashboard');

  await pull(page, grip(page, 'Tableau dashboard', 'end'), 4);
  const after = () => milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await expect.poll(() => after().due_date).toBe(plus(before.due_date, 4));
  expect(after().start_date).toBe(before.start_date);
  await expect(panel(page)).toBeHidden();

  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect.poll(() => after().due_date).toBe(before.due_date);
});

test('the left end sets the start', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await openTimeline(page);
  await expand(page, 'Coffee Shop Sales Dashboard');
  await pull(page, grip(page, 'Tableau dashboard', 'start'), 2);
  await expect
    .poll(() => milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard').start_date)
    .toBe(plus(before.start_date, 2));
});

test('the bar itself moves both dates, also inside a folded project', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await openTimeline(page);
  await pull(page, bar(page, 'Tableau dashboard'), 3);
  const after = () => milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await expect.poll(() => after().due_date).toBe(plus(before.due_date, 3));
  expect(after().start_date).toBe(plus(before.start_date, 3));
});

test('while dragging the new dates are seen, Escape puts everything back', async ({
  page,
  orbit,
}) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await openTimeline(page);
  await expand(page, 'Coffee Shop Sales Dashboard');
  const home = await bar(page, 'Tableau dashboard').boundingBox();

  await pull(page, bar(page, 'Tableau dashboard'), 5, false);
  await expect(page.getByText('(срок +5)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('(срок +5)')).toBeHidden();
  await page.mouse.up();
  expect((await bar(page, 'Tableau dashboard').boundingBox())?.x).toBeCloseTo(home?.x ?? 0, 0);
  await page.waitForTimeout(300);
  expect(milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard')).toEqual(before);
  await expect(panel(page)).toBeHidden();
});

test('a lone deadline is a point: it moves and grows a start', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'sql-practice', 'Mock interview');
  expect(before.start_date).toBeNull();
  await openTimeline(page);
  await expand(page, 'SQL Interview Practice');
  const after = () => milestone(orbit.cli, 'sql-practice', 'Mock interview');

  await pull(page, bar(page, 'Mock interview'), 2);
  await expect.poll(() => after().due_date).toBe(plus(before.due_date, 2));
  expect(after().start_date).toBeNull();

  await pull(page, grip(page, 'Mock interview', 'start'), -3);
  await expect.poll(() => after().start_date).toBe(plus(before.due_date, -1));
  expect(after().due_date).toBe(plus(before.due_date, 2));
});

test('dates are drawn on an empty row', async ({ page, orbit }) => {
  await openTimeline(page);
  const track = row(page, 'Reading List').getByRole('gridcell').last();
  const box = await track.boundingBox();
  if (!box) throw new Error('no track');
  const y = box.y + box.height / 2;
  const x = 1000;
  await page.mouse.move(x, y);
  await expect(page.getByText(/проведи, чтобы задать срок/)).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(x + 2 * DAY, y, { steps: 4 });
  await page.mouse.move(x + 5 * DAY, y, { steps: 4 });
  await page.mouse.up();

  await expect(bar(page, 'Reading List')).toBeVisible();
  const project = () => orbit.cli('project', 'show', 'reading-list') as Dated;
  await expect.poll(() => project().start_date).toBeTruthy();
  expect(project().due_date).toBe(plus(project().start_date, 5));
});

test('facts are not dragged, a click still opens them', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Data cleaning');
  await openTimeline(page);
  await expand(page, 'Coffee Shop Sales Dashboard');
  await expect(grip(page, 'Data cleaning', 'end')).toHaveCount(0);
  await pull(page, bar(page, 'Data cleaning'), 4);
  await page.waitForTimeout(300);
  expect(milestone(orbit.cli, 'coffee-dashboard', 'Data cleaning')).toEqual(before);
  await bar(page, 'Data cleaning').click();
  await expect(panel(page)).toContainText('Data cleaning');
});

test('keys: a series of presses is one change in the journal', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await openTimeline(page);
  await expand(page, 'Coffee Shop Sales Dashboard');
  await row(page, 'Tableau dashboard').focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press(']');
  const after = () => milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await expect.poll(() => after().due_date).toBe(plus(before.due_date, 3));
  const events = orbit.cli('log', '--entity', 'milestone', '--id', String(before.id));
  expect(events.filter((e: { field: string }) => e.field === 'due_date')).toHaveLength(1);

  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => after().start_date).toBe(plus(before.start_date, -1));
  expect(after().due_date).toBe(plus(before.due_date, 2));
});

test('arrows, the date menu and adding work as in the tree', async ({ page, orbit: _ }) => {
  await openTimeline(page);
  await row(page, 'SQL Interview Practice').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 'Joins and aggregates')).toBeFocused();
  await page.keyboard.press('s');
  await expect(page.getByRole('menuitemradio', { name: 'В работе' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page, 'Joins and aggregates')).toBeFocused();
  await page.keyboard.press('d');
  await expect(page.getByRole('dialog', { name: 'Срок' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page, 'Joins and aggregates')).toBeFocused();
  await page.keyboard.press('n');
  await page.keyboard.type('New task');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'New task')).toBeVisible();
});

test('a change from the terminal moves the bar by itself', async ({ page, orbit }) => {
  const before = milestone(orbit.cli, 'coffee-dashboard', 'Tableau dashboard');
  await openTimeline(page);
  const home = await bar(page, 'Tableau dashboard').boundingBox();
  orbit.cli('set', 'milestone', String(before.id), '--due', plus(before.due_date, 6));
  await expect
    .poll(async () => (await bar(page, 'Tableau dashboard').boundingBox())?.width)
    .toBeCloseTo((home?.width ?? 0) + 6 * DAY, 0);
});

test('zoom by buttons, keys and Ctrl with the wheel; T returns to today', async ({
  page,
  orbit: _,
}) => {
  await openTimeline(page);
  const today = page.getByRole('columnheader', { name: 'Время' }).getByText('сегодня');
  const pressed = (name: string) => page.getByRole('button', { name, exact: true, pressed: true });
  await expect(pressed('Недели')).toBeVisible();
  await page.getByRole('button', { name: 'Месяцы', exact: true }).click();
  await expect(today).toBeInViewport();
  await page.keyboard.press('+');
  await expect(pressed('Недели')).toBeVisible();
  await page.mouse.move(900, 400);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Control');
  await expect(pressed('Месяцы')).toBeVisible();
  await page.keyboard.press('-');
  await page.keyboard.press('+');
  await expect(today).toBeInViewport();

  await page.mouse.wheel(3000, 0);
  await expect(today).not.toBeInViewport();
  await page.keyboard.press('t');
  await expect(today).toBeInViewport();
  await page.reload();
  await expect(pressed('Недели')).toBeVisible();
});

test('a bar out of sight can be brought back', async ({ page, orbit: _ }) => {
  await openTimeline(page);
  await expand(page, 'SQL Interview Practice');
  await page.mouse.move(900, 400);
  await page.mouse.wheel(3000, 0);
  await page.getByRole('button', { name: 'Показать на шкале: CTEs' }).click();
  await expect(bar(page, 'CTEs')).toBeInViewport();
});

test('the palette reaches a row and switches the screen', async ({ page, orbit: _ }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('гант');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('columnheader', { name: 'Время' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Data collection');
  await page.keyboard.press('Enter');
  await expect(panel(page)).toContainText('Data collection');
  await expect(bar(page, 'Data collection')).toBeInViewport();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    test.use({ colorScheme });
    test('timeline and legend', async ({ page, orbit: _ }) => {
      await openTimeline(page);
      await expand(page, 'Coffee Shop Sales Dashboard', 'KPI design', 'Tableau dashboard');
      for (const zoom of ['Дни', 'Месяцы', 'Недели']) {
        await page.getByRole('button', { name: zoom, exact: true }).click();
        await page.waitForTimeout(300);
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`),
        ).toEqual([]);
      }
      await page.getByRole('button', { name: 'Как читать' }).click();
      await page.waitForTimeout(300);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
    });
  });
}

for (const width of [360, 768, 1024, 1920]) {
  test(`the timeline scrolls inside itself, not the page, at ${width} px`, async ({
    page,
    orbit: _,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await openTimeline(page);
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(wide).toBe(false);
    await expect(page.getByRole('columnheader', { name: 'Время' })).toBeInViewport();
  });
}
