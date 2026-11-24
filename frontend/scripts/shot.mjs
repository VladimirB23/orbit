// Screenshots for eyeballing: node scripts/shot.mjs <url> <outdir>. Demo data only.
import { chromium } from '@playwright/test';

const [url = 'http://127.0.0.1:8431', out = 'test-results/shots'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });

async function page(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    ...options,
  });
  const p = await context.newPage();
  p.on(
    'console',
    (m) => ['error', 'warning'].includes(m.type()) && console.log('CONSOLE', m.text()),
  );
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(url);
  await p.getByRole('treegrid').waitFor();
  await p.waitForTimeout(300);
  return p;
}

const light = await page({ colorScheme: 'light' });
await light.screenshot({ path: `${out}/1-light.png` });
for (const name of await light.getByRole('button', { name: 'Развернуть' }).all()) void name;
await light.locator('[role=row][data-key^=project]').first().focus();
await light.keyboard.press('ArrowRight');
await light.keyboard.press('ArrowDown');
await light.keyboard.press('ArrowRight');
await light.keyboard.press('ArrowDown');
await light.keyboard.press('ArrowDown');
await light.waitForTimeout(200);
await light.screenshot({ path: `${out}/2-expanded.png` });
await light.keyboard.press('Enter');
await light.waitForTimeout(500);
await light.screenshot({ path: `${out}/3-panel.png` });
await light.keyboard.press('Escape');
await light.keyboard.press('s');
await light.waitForTimeout(300);
await light.screenshot({ path: `${out}/4-status.png` });
await light.keyboard.press('Escape');
await light.waitForTimeout(300);
await light.keyboard.press('d');
await light.waitForTimeout(300);
await light.screenshot({ path: `${out}/5-date.png` });
await light.keyboard.press('Escape');
await light.waitForTimeout(300);
await light.getByRole('button', { name: /Просрочено/ }).click();
await light.waitForTimeout(300);
await light.screenshot({ path: `${out}/6-overdue.png` });

const dark = await page({ colorScheme: 'dark' });
await dark.locator('[role=row][data-key^=project]').nth(1).focus();
await dark.keyboard.press('ArrowRight');
await dark.keyboard.press('Enter');
await dark.waitForTimeout(500);
await dark.screenshot({ path: `${out}/7-dark.png` });

const phone = await page({ viewport: { width: 390, height: 800 }, colorScheme: 'light' });
await phone.screenshot({ path: `${out}/8-phone.png` });
await browser.close();
