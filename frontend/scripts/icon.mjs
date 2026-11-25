// Draws bin/orbit.ico from public/orbit.svg: node scripts/icon.mjs
// An .ico file is a small table and the pictures after it; Windows reads PNG inside since Vista.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const svg = readFileSync(new URL('../public/orbit.svg', import.meta.url), 'utf8');

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const pictures = [];
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  pictures.push(await page.screenshot({ omitBackground: true }));
}
await browser.close();

const table = Buffer.alloc(6 + 16 * SIZES.length);
table.writeUInt16LE(1, 2); // an icon
table.writeUInt16LE(SIZES.length, 4);
let offset = table.length;
SIZES.forEach((size, i) => {
  const at = 6 + 16 * i;
  table.writeUInt8(size % 256, at); // 256 is written as 0
  table.writeUInt8(size % 256, at + 1);
  table.writeUInt16LE(1, at + 4);
  table.writeUInt16LE(32, at + 6);
  table.writeUInt32LE(pictures[i].length, at + 8);
  table.writeUInt32LE(offset, at + 12);
  offset += pictures[i].length;
});
writeFileSync(new URL('../../bin/orbit.ico', import.meta.url), Buffer.concat([table, ...pictures]));
