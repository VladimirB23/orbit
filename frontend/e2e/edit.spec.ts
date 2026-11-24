import { expand, expect, panel, row, test } from './fixtures';

const open = (page: Parameters<typeof row>[0], title: string) =>
  row(page, title).getByRole('button', { name: title, exact: true });

test('status menu saves and survives a reload', async ({ page, orbit: _ }) => {
  await row(page, 'Reading List')
    .getByRole('button', { name: /^Статус/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'На паузе' }).click();
  const paused = row(page, 'Reading List').getByRole('button', { name: 'Статус: На паузе' });
  await expect(paused).toBeVisible();
  await page.reload();
  await expect(paused).toBeVisible();
});

test('the circle completes a task and the toast brings it back', async ({ page, orbit: _ }) => {
  await expand(page, 'SQL Interview Practice', 'Window functions');
  const task = row(page, 'LAG/LEAD for retention');
  await task.getByRole('button', { name: 'Готово: LAG/LEAD for retention' }).click();
  await expect(task.getByRole('button', { name: 'Статус: Готово' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(task.getByRole('button', { name: 'Статус: В работе' })).toBeVisible();
});

test('closing a milestone with open tasks asks first', async ({ page, orbit: _ }) => {
  await expand(page, 'SQL Interview Practice');
  const milestone = row(page, 'Window functions');
  const close = milestone.getByRole('button', { name: 'Готово: Window functions' });

  await close.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена' }).click();
  await expect(milestone.getByRole('button', { name: 'Статус: В работе' })).toBeVisible();

  await close.click();
  await page.getByRole('button', { name: 'Все равно закрыть' }).click();
  await expect(milestone.getByRole('button', { name: 'Статус: Готово' })).toBeVisible();
});

test('renames on double click, by F2 and from the row menu', async ({ page, orbit: _ }) => {
  await open(page, 'Reading List').dblclick();
  await page.getByRole('textbox', { name: 'Название' }).fill('Books');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Books')).toBeFocused();

  await page.keyboard.press('F2');
  await page.keyboard.type('Library');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Library')).toBeFocused();

  await page.getByRole('button', { name: 'Действия: Library' }).click();
  await page.getByRole('menuitem', { name: /Переименовать/ }).click();
  const field = page.getByRole('textbox', { name: 'Название' });
  await page.waitForTimeout(400); // the menu has fully closed and must not take the focus back
  await expect(field).toBeFocused();
  await page.keyboard.type('Shelf');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Shelf')).toBeVisible();
});

test('dates: quick choice and clearing', async ({ page, orbit: _ }) => {
  const target = row(page, 'Reading List');
  await target.hover();
  await target.getByRole('button', { name: 'срок' }).click();
  await page.getByRole('button', { name: 'Завтра' }).click();
  const due = target.getByRole('button', { name: 'завтра' });
  await expect(due).toBeVisible();
  await due.click();
  await page.getByRole('button', { name: /Убрать дату/ }).click();
  await expect(due).toBeHidden();
});

test('a date picked in the calendar is the same day in the database', async ({ page, orbit }) => {
  const target = row(page, 'Reading List');
  await target.focus();
  await page.keyboard.press('d');
  await page.getByLabel('Срок').locator('button:text-is("15")').click();
  await expect(target.getByRole('button', { name: /^15 / })).toBeVisible();
  expect(orbit.cli('project', 'show', 'reading-list').due_date).toMatch(/-15$/);
});

test('adds several tasks in a row without touching the mouse', async ({ page, orbit }) => {
  await row(page, 'Reading List').focus();
  await page.keyboard.press('n');
  for (const title of ['First', 'Second']) {
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    await expect(row(page, title)).toBeVisible();
  }
  const last = 'Saved when leaving the field';
  await page.keyboard.type(last);
  await page.getByRole('searchbox', { name: 'Поиск' }).click();
  await expect(row(page, last)).toBeVisible();
  const titles = orbit.cli('task', 'list', 'reading-list').map((t: { title: string }) => t.title);
  expect(titles).toEqual(expect.arrayContaining(['First', 'Second', last]));
});

test('adds a milestone, then a task and a subtask inside', async ({ page, orbit: _ }) => {
  await row(page, 'Reading List').hover();
  await row(page, 'Reading List').getByRole('button', { name: 'Добавить в проект' }).click();
  await page.getByRole('menuitem', { name: /Этап/ }).click();
  await page.getByRole('textbox', { name: 'Название этапа' }).fill('Autumn');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Autumn')).toBeVisible();
  await page.keyboard.press('Escape');

  await row(page, 'Autumn').hover();
  await row(page, 'Autumn').getByRole('button', { name: 'Добавить задачу' }).click();
  await page.keyboard.type('Read one book');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Read one book')).toHaveAttribute('aria-level', '3');
  await page.keyboard.press('Escape');

  await row(page, 'Read one book').hover();
  await row(page, 'Read one book').getByRole('button', { name: 'Добавить подзадачу' }).click();
  await page.keyboard.type('Chapter 1');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Chapter 1')).toHaveAttribute('aria-level', '4');
});

test('deletes only after a confirmation', async ({ page, orbit: _ }) => {
  await expand(page, 'SQL Interview Practice', 'Window functions');
  const task = row(page, 'LAG/LEAD for retention');
  await task.focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(task).toBeVisible();
  await task.focus();
  await page.keyboard.press('Delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(task).toBeHidden();
});

test('creates a project with a code made from its Russian name', async ({ page, orbit: _ }) => {
  await page.getByRole('button', { name: 'Новый проект' }).click();
  await page.getByLabel('Название').fill('Поиск работы');
  await expect(page.getByLabel('Код')).toHaveValue('poisk-raboty');
  await page.getByLabel('Код').fill('reading-list');
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await expect(page.getByRole('alert')).toContainText('уже есть');
  await page.getByLabel('Код').fill('job');
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await expect(row(page, 'Поиск работы')).toBeVisible();
  await expect(panel(page)).toContainText('Поиск работы');
});

test('archives a project and takes it back', async ({ page, orbit: _ }) => {
  await open(page, 'Reading List').click();
  await panel(page).getByRole('button', { name: 'В архив' }).click();
  await expect(row(page, 'Reading List')).toBeHidden();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(row(page, 'Reading List')).toBeVisible();
});

test('panel edits a task and moves it to another milestone', async ({ page, orbit: _ }) => {
  await expand(page, 'SQL Interview Practice', 'Window functions');
  await open(page, 'LAG/LEAD for retention').click();
  const priority = panel(page).locator('dt:text-is("Приоритет") + dd').getByRole('button');
  await priority.click();
  await page.getByRole('menuitemradio', { name: 'Срочно' }).click();
  await expect(priority).toHaveText('Срочно');

  await panel(page).locator('dt:text-is("Этап") + dd').getByRole('button').click();
  await page.getByRole('menuitemradio', { name: 'Mock interview' }).click();
  await expect(panel(page).getByLabel('Путь')).toContainText('Mock interview');
  await expect(panel(page).getByLabel('История')).toContainText('Этап: ');
});

test('panel comment: text is kept when it is too long', async ({ page, orbit: _ }) => {
  await expand(page, 'SQL Interview Practice', 'Window functions');
  await open(page, 'LAG/LEAD for retention').click();
  await panel(page)
    .getByRole('button', { name: /^Комментарий/ })
    .click();
  const field = panel(page).getByRole('textbox', { name: 'Комментарий' });
  await field.fill('x'.repeat(281));
  await field.press('Enter');
  await expect(panel(page).getByRole('alert')).toContainText('281 из 280');
  await field.fill('Short enough');
  await field.press('Enter');
  await expect(row(page, 'LAG/LEAD for retention')).toContainText('Short enough');
});
