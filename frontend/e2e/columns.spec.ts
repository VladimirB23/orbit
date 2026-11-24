import type { Locator, Page } from '@playwright/test';
import { expand, expect, panel, row, test } from './fixtures';

const header = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });
const edge = (page: Page, label: string) =>
  page.getByRole('separator', { name: `Ширина поля «${label}»` });

async function width(target: Locator): Promise<number> {
  return (await target.boundingBox())?.width ?? 0;
}

async function pull(page: Page, handle: Locator, by: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('no handle');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by / 2, y, { steps: 3 });
  await page.mouse.move(x + by, y, { steps: 3 });
  await page.mouse.up();
}

async function field(page: Page, name: string) {
  await page.getByRole('button', { name: 'Поля' }).click();
  await page.getByRole('menuitemcheckbox', { name }).click();
  await page.keyboard.press('Escape');
}

const titleOf = (page: Page, title: string) =>
  row(page, title).getByRole('button', { name: title, exact: true });

const isCut = (title: Locator) =>
  title.evaluate((element) => element.scrollWidth > element.clientWidth);

for (const label of ['Статус', 'Прогресс', 'Старт', 'Срок']) {
  test(`«${label}» is made wider by the mouse and remembered`, async ({ page, orbit: _ }) => {
    const before = await width(header(page, label));
    await pull(page, edge(page, label), 60);
    await expect.poll(() => width(header(page, label))).toBeCloseTo(before + 60, 0);
    await page.reload();
    await expect.poll(() => width(header(page, label))).toBeCloseTo(before + 60, 0);
    await edge(page, label).dblclick();
    await expect.poll(() => width(header(page, label))).toBeCloseTo(before, 0);
  });
}

test('name and comment too; a double click on the name shows every title in full', async ({
  page,
  orbit,
}) => {
  const long =
    'A very long name of a project that does not fit into the usual width at all, no way';
  orbit.cli('project', 'add', 'long', '--name', long);
  await expect(row(page, long)).toBeVisible();

  const note = await width(header(page, 'Комментарий'));
  await pull(page, edge(page, 'Название'), 80);
  await expect.poll(() => width(header(page, 'Комментарий'))).toBeLessThan(note);

  await pull(page, edge(page, 'Название'), -250);
  expect(await isCut(titleOf(page, long))).toBe(true);
  await edge(page, 'Название').dblclick();
  await expect.poll(() => isCut(titleOf(page, long))).toBe(false);

  await pull(page, edge(page, 'Комментарий'), 40);
  expect(await page.evaluate(() => localStorage.getItem('orbit.fields'))).toContain('"note"');
});

test('widths by keyboard', async ({ page, orbit: _ }) => {
  const before = await width(header(page, 'Срок'));
  await edge(page, 'Срок').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(header(page, 'Срок'))).toBeCloseTo(before + 32, 0);
  await page.keyboard.press('Enter');
  await expect.poll(() => width(header(page, 'Срок'))).toBeCloseTo(before, 0);
});

test('fields are hidden, added and brought back', async ({ page, orbit: _ }) => {
  await field(page, 'Прогресс');
  await expect(header(page, 'Прогресс')).toBeHidden();
  await field(page, 'Приоритет');
  await field(page, 'Изменено');
  await expect(header(page, 'Приоритет')).toBeVisible();
  await row(page, 'Reading List')
    .getByRole('button', { name: /^Приоритет/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'Высокий' }).click();
  await expect(
    row(page, 'Reading List').getByRole('button', { name: 'Приоритет: Высокий' }),
  ).toBeVisible();

  await page.reload();
  await expect(header(page, 'Прогресс')).toBeHidden();
  await expect(header(page, 'Изменено')).toBeVisible();
  await page.getByRole('button', { name: 'Поля' }).click();
  await page.getByRole('menuitem', { name: 'Вернуть обычный вид' }).click();
  await expect(header(page, 'Прогресс')).toBeVisible();
  await expect(header(page, 'Изменено')).toBeHidden();
});

test('the key of a hidden field opens the panel', async ({ page, orbit: _ }) => {
  await field(page, 'Срок');
  await row(page, 'Reading List').focus();
  await page.keyboard.press('d');
  await expect(panel(page)).toContainText('Reading List');
});

test('timeline: the names get wider and push the chart', async ({ page, orbit: _ }) => {
  await page.keyboard.press('g');
  await expand(page, 'SQL Interview Practice');
  const chart = header(page, 'Время');
  const names = header(page, 'Название и срок');
  const bar = page.getByRole('button', { name: /^Mock interview: / });
  const [namesBefore, barBefore] = [await width(names), await bar.boundingBox()];
  const scrolled = () =>
    page
      .locator('.timeline > div')
      .first()
      .evaluate((box) => box.scrollLeft);
  const at = await scrolled();

  await pull(page, edge(page, 'Название'), 120);
  await expect.poll(() => width(names)).toBeCloseTo(namesBefore + 120, 0);
  const shift = (await scrolled()) - at;
  const barAfter = await bar.boundingBox();
  expect((barAfter?.x ?? 0) + shift).toBeCloseTo((barBefore?.x ?? 0) + 120, 0);
  await expect(chart).toBeVisible();

  await page.reload();
  await expect.poll(() => width(names)).toBeCloseTo(namesBefore + 120, 0);
});

test('timeline: the edge is pulled anywhere, a double click fits the titles', async ({
  page,
  orbit: _,
}) => {
  await page.keyboard.press('g');
  await expand(page, 'Coffee Shop Sales Dashboard', 'Tableau dashboard');
  const title = titleOf(page, 'Publish to Tableau Public');
  expect(await isCut(title)).toBe(true);
  const names = await header(page, 'Название и срок').boundingBox();
  const x = (names?.x ?? 0) + (names?.width ?? 0);
  await page.mouse.dblclick(x, 600);
  await expect.poll(() => isCut(title)).toBe(false);
  await expect.poll(() => isCut(titleOf(page, 'Coffee Shop Sales Dashboard'))).toBe(false);
});

test('timeline has its own set of fields', async ({ page, orbit: _ }) => {
  await page.keyboard.press('g');
  const status = row(page, 'Reading List').getByRole('button', { name: /^Статус/ });
  await field(page, 'Статус');
  await expect(status).toHaveText('Идея');
  await field(page, 'Срок');
  await row(page, 'Reading List').focus();
  await page.keyboard.press('s');
  await expect(page.getByRole('menuitemradio', { name: 'В работе' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page, 'Reading List')).toBeFocused();
  await page.keyboard.press('g');
  await expect(header(page, 'Срок')).toBeVisible();
});
