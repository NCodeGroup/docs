#!/usr/bin/env node
// Takes the screenshots a theme change is judged by: the fixture's landing page and one
// documentation page, in the light and the dark theme, at 1440 by 900 and at 390 by 844.
//
//   npm run build && node scripts/screenshots.mjs [output folder]     (default .shots/)
//
// It serves dist/ under the fixture's base path on a free port and uses the browser the browser test
// uses: "npm run browser" installs it.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { root, serve } from '../test/helpers.mjs';

const BASE = '/Fixture/';
const PAGES = [
  { name: 'landing', path: '' },
  { name: 'docs', path: 'quick-start/' },
];
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

const output = resolve(process.argv[2] ?? join(root, '.shots'));
mkdirSync(output, { recursive: true });
const site = await serve(join(root, 'dist'), BASE);
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    for (const size of SIZES) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      for (const { name, path } of PAGES) {
        await page.goto(`${site.origin}${BASE}${path}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const file = join(output, `${name}-${theme}-${size.name}`);
        await page.screenshot({ path: `${file}.png` });
        await page.screenshot({ path: `${file}-full.png`, fullPage: true });
        console.log(`${file}.png`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await site.close();
}
