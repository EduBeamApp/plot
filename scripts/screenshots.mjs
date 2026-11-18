/**
 * Screenshots of the playground, cropped to each figure. Needs `npm run dev` running.
 * Playwright comes from the EduBeam app's install, so this package does not depend on it.
 *
 *   node scripts/screenshots.mjs [url] [outDir]
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/rex/repos/edubeam/node_modules/playwright');

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(theme === 'dark' ? `${url}?dark` : url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  for (const tile of await page.locator('[data-case]').all()) {
    const id = await tile.getAttribute('data-case');
    await tile.screenshot({ path: join(out, `${theme}-tile-${id}.png`) });
  }
  for (const tile of await page.locator('[data-case-axis]').all()) {
    const id = await tile.getAttribute('data-case-axis');
    await tile.screenshot({ path: join(out, `${theme}-tile-axis-${id}.png`) });
  }
  for (const id of [
    'tiles',
    'tiles-axis',
    'portal-modes',
    'pratt-lecture',
    'supports',
    'slide-pratt',
    'slide-pratt-pinned',
  ]) {
    const el = page.locator(`#${id}`);
    if ((await el.count()) > 0) await el.screenshot({ path: join(out, `${theme}-${id}.png`) });
  }
  // A static plot must let the page scroll under the wheel.
  const box = await page.locator('#slide-pratt svg').boundingBox();
  await page.evaluate((y) => window.scrollTo(0, y - 200), box?.y ?? 0);
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.scrollY);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, 400);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
  }
  const after = await page.evaluate(() => window.scrollY);
  console.log(`${theme}: wheel over a static plot scrolled the page by ${after - before}px`);
  if (errors.length) console.log(`${theme} errors:\n${errors.join('\n')}`);
  await page.close();
}
await browser.close();
console.log(`saved to ${out}`);
