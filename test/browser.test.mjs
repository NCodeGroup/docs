// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The built site in a real browser, served under its base path the way GitHub Pages serves it: a
// page loads, the search finds a page, a missing URL gets the site's own 404 page, and the browser
// asks no other origin for anything. In a phone's window no page scrolls sideways and a Markdown
// table is a stack of labelled rows, from 40rem up a wide one fits the content column, and a code
// listing that scrolls lights its edge and keeps its focus ring in view.
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

/** The colour of the pixel at `x`, `y` of the page's window, as [red, green, blue], read from a screenshot. */
async function pixel(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (data) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(1, 1).getContext('2d');
    canvas.drawImage(image, 0, 0);
    return [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, png.toString('base64'));
}

describe('the built site in a browser', { skip: browser ? false : missing }, () => {
  const BASE = '/Fixture/';
  let site;
  let page;
  /** A page in a phone's window, 390 by 844. */
  let phone;
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
    phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    phone.on('pageerror', (error) => errors.push(error.message));
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

  it('lets no page scroll sideways on a phone', async () => {
    for (const path of [
      '',
      'quick-start/',
      'guides/derive-a-key/',
      'guides/extension-members/',
      'guides/ban-apis/',
      'concepts/how-sealing-works/',
      'reference/api/',
      'reference/behaviour/',
    ]) {
      await phone.goto(`${site.origin}${BASE}${path}`, { waitUntil: 'networkidle' });
      await phone.evaluate(() => document.fonts.ready);
      const [scroll, client] = await phone.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      assert.ok(
        scroll <= client,
        `${BASE}${path} scrolls sideways on a phone: ${scroll} px of content in ${client} px`,
      );
    }
  });

  it('stacks a Markdown table on a phone, each cell under its column name', async () => {
    await phone.goto(`${site.origin}${BASE}reference/api/`, { waitUntil: 'networkidle' });
    await phone.evaluate(() => document.fonts.ready);
    const stacked = await phone.evaluate(() => {
      const table = document.querySelector('.sl-markdown-content table');
      return {
        fits: table.scrollWidth <= table.clientWidth,
        labels: [...table.querySelectorAll('tbody tr:first-child td')].map(
          (cell) => getComputedStyle(cell, '::before').content,
        ),
        head: table.querySelector('thead').getBoundingClientRect().height,
      };
    });
    assert.deepEqual(stacked, { fits: true, labels: ['"Member"', '"Returns"', '"Notes"'], head: 1 });

    await page.goto(`${site.origin}${BASE}reference/api/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const wide = await page.evaluate(() => {
      const cell = document.querySelector('.sl-markdown-content tbody td');
      return [getComputedStyle(cell).display, getComputedStyle(cell, '::before').content];
    });
    assert.deepEqual(wide, ['table-cell', 'none']);
  });

  it('keeps a wide Markdown table inside the content column at 1440, 1280 and 1024 px', async () => {
    for (const width of [1440, 1280, 1024]) {
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      await tab.goto(`${site.origin}${BASE}reference/behaviour/`, { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      const [past, hidden] = await tab.evaluate(() => {
        const column = document.querySelector('.sl-markdown-content').getBoundingClientRect();
        const table = document.querySelector('.sl-markdown-content table');
        const box = table.closest('.ncode-table') ?? table;
        return [Math.round(table.getBoundingClientRect().right - column.right), box.scrollWidth - box.clientWidth];
      });
      await tab.close();
      assert.ok(past <= 1, `at ${width} px the table extends ${past} px past the content column`);
      assert.ok(hidden <= 1, `at ${width} px the table hides ${hidden} px sideways`);
    }
  });

  it('keeps the navigation on the landing page, and its hero one column until the column is 50rem wide', async () => {
    const landing = async (width) => {
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      await tab.goto(`${site.origin}${BASE}`, { waitUntil: 'networkidle' });
      const found = await tab.evaluate(() => ({
        sidebar: document.documentElement.hasAttribute('data-has-sidebar'),
        columns: getComputedStyle(document.querySelector('.hero')).gridTemplateColumns.split(' ').length,
      }));
      await tab.close();
      return found;
    };
    assert.deepEqual(await landing(1024), { sidebar: true, columns: 1 });
    assert.deepEqual(await landing(1440), { sidebar: true, columns: 2 });
  });

  it('lights the edge of a code listing that has more code past it', async () => {
    await phone.goto(`${site.origin}${BASE}guides/derive-a-key/`, { waitUntil: 'networkidle' });
    await phone.evaluate(() => document.fonts.ready);
    const listing = phone.locator('.expressive-code pre').first();
    await listing.scrollIntoViewIfNeeded();
    const box = await listing.boundingBox();
    // In the listing's top padding, below its rounded corners and above its first line.
    const y = box.y + 12;
    const edges = async () => [await pixel(phone, box.x, y), await pixel(phone, box.x + box.width - 1, y)];
    const [startLeft, startRight] = await edges();
    await listing.evaluate((pre) => {
      pre.scrollLeft = pre.scrollWidth;
    });
    const [endLeft, endRight] = await edges();
    assert.deepEqual(startLeft, endRight, 'an edge with no code past it is the plain screen');
    assert.notDeepEqual(startRight, endRight, 'the right edge is lit while code is hidden past it');
    assert.notDeepEqual(endLeft, startLeft, 'the left edge is lit once code is hidden past it');
  });

  it('draws the focus ring of a code listing in the lit colour, inside its edge', async () => {
    await phone.goto(`${site.origin}${BASE}guides/derive-a-key/`, { waitUntil: 'networkidle' });
    await phone.evaluate(() => document.fonts.ready);
    const listing = phone.locator('.expressive-code pre').first();
    await listing.focus();
    const ring = await listing.evaluate((pre) => {
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.color = 'var(--nc-color-screen-lit)';
      const lit = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(pre);
      return {
        visible: pre.matches(':focus-visible'),
        lit: style.outlineColor === lit,
        style: style.outlineStyle,
        inside: Number.parseFloat(style.outlineOffset) < 0,
      };
    });
    assert.deepEqual(ring, { visible: true, lit: true, style: 'solid', inside: true });
  });

  it('lays out the pitfalls as a list, each label italic in the secondary text colour', async () => {
    await page.goto(`${site.origin}${BASE}guides/derive-a-key/`, { waitUntil: 'networkidle' });
    const pitfalls = await page.evaluate(() => {
      const list = getComputedStyle(document.querySelector('.ncode-pitfalls > ul'));
      const label = document.querySelector('.ncode-pitfalls > ul > li > ul > li > em');
      const style = getComputedStyle(label);
      return {
        display: list.display,
        listStyleType: list.listStyleType,
        text: label.textContent,
        fontStyle: style.fontStyle,
        secondary: style.color !== getComputedStyle(label.closest('li')).color,
      };
    });
    assert.deepEqual(pitfalls, {
      display: 'grid',
      listStyleType: 'none',
      text: 'You write',
      fontStyle: 'italic',
      secondary: true,
    });
  });

  it("draws inline code on the brand's code tint, with no edge", async () => {
    await page.goto(`${site.origin}${BASE}quick-start/`, { waitUntil: 'networkidle' });
    const code = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.backgroundColor = 'var(--nc-color-code-tint)';
      const tint = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const style = getComputedStyle(document.querySelector('.sl-markdown-content p:not(.starlight-aside *) > code'));
      return { tint: style.backgroundColor === tint, edge: style.borderTopStyle };
    });
    assert.deepEqual(code, { tint: true, edge: 'none' });
  });

  it('asks no other origin for anything', () => {
    const elsewhere = requested.filter(
      (url) => !url.startsWith(site.origin) && !url.startsWith('data:') && !url.startsWith('blob:'),
    );
    assert.deepEqual(elsewhere, []);
    assert.deepEqual(errors, [], 'script errors on the pages');
  });
});
