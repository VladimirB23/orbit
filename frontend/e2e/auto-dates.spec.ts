import { writeFileSync } from 'node:fs';
import { expand, expect, row, test } from './fixtures';

/** The settings file of this test's own database. */
const settings = (db: string) => db.replace(/\.db$/, '.toml');

test('a planned idea gets a deadline by itself, Ctrl+Z takes back both', async ({
  page,
  orbit,
}) => {
  await orbit.stopServer();
  writeFileSync(settings(orbit.db), 'auto_dates = true\n');
  await orbit.startServer();
  await page.reload();

  await expand(page, 'Reading List');
  const idea = row(page, 'Pick a stack');
  await expect(idea.locator('time')).toHaveCount(0);
  await idea.focus();
  await page.keyboard.press('s');
  await page.getByRole('menuitemradio', { name: 'Запланировано' }).click();
  await expect(idea.locator('time')).toHaveCount(1);

  await idea.getByRole('button', { name: 'Pick a stack', exact: true }).click();
  await expect(page.getByRole('complementary')).toContainText('Система');
  await page.keyboard.press('Control+z');
  await expect(idea.locator('time')).toHaveCount(0);
  await expect(idea).toContainText('Идея');
});

test('without the setting nothing appears', async ({ page, orbit: _ }) => {
  await expand(page, 'Reading List');
  const idea = row(page, 'Pick a stack');
  await idea.focus();
  await page.keyboard.press('s');
  await page.getByRole('menuitemradio', { name: 'Запланировано' }).click();
  await expect(idea).toContainText('Запланировано');
  await expect(idea.locator('time')).toHaveCount(0);
});
