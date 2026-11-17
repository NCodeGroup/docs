// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The built site in a real browser, served under its base path the way GitHub Pages serves it: a
// page loads, the search finds a page, a missing URL gets the site's own 404 page, and the browser
// asks no other origin for anything.
//
// The browser is the headless Chromium that the locked playwright-core names. "npm run browser"
// downloads it, once for each version of playwright-core. Where it is not installed the check is
// skipped and says so; DOCS_REQUIRE_BROWSER=1 makes that a failure, as CI sets it.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright-core';
import { build, serve } from './helpers.mjs';

let browser;
let missing;
try {
  browser = await chromium.launch();
} catch (error) {
  if (process.env.DOCS_REQUIRE_BROWSER)
    throw new Error(
      `DOCS_REQUIRE_BROWSER is set, but the browser did not start. Run "npm run browser" first.\n${error.message}`,
    );
  missing = `the browser did not start, and "npm run browser" installs it: ${error.message.split('\n')[0]}`;
}

describe('the built site in a browser', { skip: browser ? false : missing }, () => {
  const BASE = '/Fixture/';
  let site;
  let page;
  /** Every URL the browser asked for. */
  const requested = [];
  const errors = [];

  before(async () => {
    const result = build('browser');
    assert.equal(result.code, 0, result.output);
    site = await serve(result.out, BASE);
    page = await browser.newPage();
    page.on('request', (request) => requested.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
  });

  after(async () => {
    await browser?.close();
    await site?.close();
  });

  it('loads a page under the base, with its sample, styles and fonts', async () => {
    const response = await page.goto(`${site.origin}${BASE}quick-start/`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(await page.title(), 'Quick start | NCode.Fixture');
    // biome-ignore lint/performance/useDomNodeTextContent: the check reads the page as a reader sees it, which innerText gives and textContent does not.
    assert.match(await page.locator('main').innerText(), /using var vault = Vault\.Rent\(32, out Span<byte> key\);/);
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() =>
      [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family.replaceAll('"', '')),
    );
    assert.ok(fonts.includes('Instrument Sans Variable'), `the text font did not load: ${fonts}`);
    assert.ok(fonts.includes('Martian Mono Variable'), `the code font did not load: ${fonts}`);
    const failed = requested.filter((url) => url.startsWith(site.origin) && !url.startsWith(`${site.origin}${BASE}`));
    assert.deepEqual(failed, [], 'requests outside the base');
  });

  it('finds a page through the search', async () => {
    await page.locator('button[data-open-modal]').click();
    await page.locator('dialog[open] input').fill('extension members');
    const result = page.locator('dialog[open] .pagefind-ui__result-link').first();
    await result.waitFor({ timeout: 15_000 });
    const links = await page
      .locator('dialog[open] .pagefind-ui__result-link')
      .evaluateAll((found) => found.map((link) => link.getAttribute('href')));
    assert.ok(
      links.some((href) => href.startsWith(`${BASE}guides/extension-members/`)),
      `no result for the guide: ${links}`,
    );
    for (const href of links) assert.ok(href.startsWith(BASE), `a search result leads outside the base: ${href}`);
    await result.click();
    await page.waitForURL(`${site.origin}${BASE}guides/extension-members/**`);
  });

  it("gets the site's own 404 page for a missing URL", async () => {
    const response = await page.goto(`${site.origin}${BASE}guides/no-such-page/deeper/`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 404);
    assert.match(await page.title(), /404|not found/i);
    // The page is styled and linked from any depth: its assets and its home link carry the base.
    assert.ok(await page.locator('header a.site-title').isVisible());
    assert.equal(await page.locator('header a.site-title').getAttribute('href'), BASE);
    const stylesheets = await page.evaluate(() =>
      [...document.styleSheets].filter((sheet) => sheet.href).map((sheet) => sheet.cssRules.length),
    );
    assert.ok(stylesheets.length > 0 && stylesheets.every((rules) => rules > 0), 'the 404 page has its styles');
  });

  it('asks no other origin for anything', () => {
    const elsewhere = requested.filter(
      (url) => !url.startsWith(site.origin) && !url.startsWith('data:') && !url.startsWith('blob:'),
    );
    assert.deepEqual(elsewhere, []);
    assert.deepEqual(errors, [], 'script errors on the pages');
  });
});
