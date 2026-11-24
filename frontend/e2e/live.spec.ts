import { expand, expect, panel, row, test } from './fixtures';

test('a change from the CLI appears within two seconds, signed by Claude', async ({
  page,
  orbit,
}) => {
  await expand(page, 'SQL Interview Practice', 'Window functions');
  const target = row(page, 'LAG/LEAD for retention');
  await expect(target.getByRole('button', { name: 'Статус: В работе' })).toBeVisible();
  const id = (await target.getAttribute('data-key'))?.split('-')[1] ?? '';

  orbit.cli('set', 'task', id, '--status', 'blocked');
  await expect(target.getByRole('button', { name: 'Статус: Заблокировано' })).toBeVisible({
    timeout: 2000,
  });
  await expect(target).toHaveClass(/animate-flash/);

  await target.getByRole('button', { name: 'LAG/LEAD for retention', exact: true }).click();
  const latest = panel(page).getByLabel('История').getByRole('listitem').first();
  await expect(latest).toContainText('Claude');
  await expect(latest).toContainText('Заблокировано');
});

test('a change inside a folded project lights up the project', async ({ page, orbit }) => {
  orbit.cli('task', 'add', 'reading-list', 'From the terminal');
  await expect(row(page, 'Reading List')).toHaveClass(/animate-flash/, { timeout: 2000 });
});

test('own edits do not flash', async ({ page, orbit: _ }) => {
  const target = row(page, 'Reading List');
  await target.getByRole('button', { name: /^Статус/ }).click();
  await page.getByRole('menuitemradio', { name: 'Запланировано' }).click();
  await expect(target.getByRole('button', { name: 'Статус: Запланировано' })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(target).not.toHaveClass(/animate-flash/);
});

test('typing survives an update that arrives meanwhile', async ({ page, orbit }) => {
  const target = row(page, 'Reading List');
  await target.getByRole('button', { name: /Track books/ }).click();
  const field = page.getByRole('textbox', { name: 'Кратко' });
  await field.fill('My unfinished thought');
  orbit.cli('set', 'project', 'reading-list', '--status', 'in_progress');
  await expect(target.getByRole('button', { name: 'Статус: В работе' })).toBeVisible();
  await expect(field).toHaveValue('My unfinished thought');
  await expect(field).toBeFocused();
});

test('without a server: says so, keeps the text, recovers by itself', async ({ page, orbit }) => {
  const target = row(page, 'Reading List');
  await orbit.stopServer();
  await expect(page.getByText('Нет связи с сервером. Показаны')).toBeVisible();

  await target.getByRole('button', { name: /Track books/ }).click();
  const field = page.getByRole('textbox', { name: 'Кратко' });
  await field.fill('Typed offline');
  await field.press('Enter');
  await expect(page.getByText('изменение не сохранено')).toBeVisible();
  await expect(field).toHaveValue('Typed offline');

  await orbit.startServer();
  await expect(page.getByText('Обновляется само')).toBeVisible({ timeout: 15_000 });
  await field.press('Enter');
  await expect(target.getByRole('button', { name: 'Typed offline' })).toBeVisible();
});
