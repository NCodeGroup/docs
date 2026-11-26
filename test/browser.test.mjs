// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The built site in a real browser, served under its base path the way GitHub Pages serves it: a
// page loads, the search finds a page, a missing URL gets the site's own 404 page, and the browser
// asks no other origin for anything. In a phone's window no page scrolls sideways and a Markdown
// table is a stack of labelled rows, from 40rem up a wide one fits the content column and breaks the
// code in its cells only between words, even beside a column of prose, and a code listing that
// scrolls lights its edge and keeps its focus ring in view. In a wide window the
// selector, the page and the page index stand together in the middle, a hero with no picture is one
// column, and the content column is as wide as CONTRACT.md says at each width the layout check loads.
//
// The browser is the headless Chromium that the locked playwright-core names. "npm run browser"
// downloads it, once for each version of playwright-core. Where it is not installed the check is
// skipped and says so; DOCS_REQUIRE_BROWSER=1 makes that a failure, as CI sets it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright-core';
import { WIDTHS } from '../src/layout/check.mjs';
import { build, root, serve } from './helpers.mjs';

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

  it('breaks code in a Markdown table cell only between its words, beside a column of prose, at 1280 and 1024 px', async () => {
    for (const width of [1280, 1024]) {
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      await tab.goto(`${site.origin}${BASE}reference/behaviour/`, { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      const { past, hidden, broken } = await tab.evaluate(() => {
        const column = document.querySelector('.sl-markdown-content').getBoundingClientRect();
        const table = [...document.querySelectorAll('.sl-markdown-content table')].find(
          (candidate) => candidate.querySelector('th')?.textContent === 'Reason',
        );
        const box = table.closest('.ncode-table') ?? table;
        // The build puts a <wbr> between the words of code in a cell, so a text node of it on two lines broke inside a word.
        const lines = (node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const tops = [...range.getClientRects()].map((rect) => rect.top);
          return Math.max(...tops) - Math.min(...tops) > 3;
        };
        return {
          past: Math.round(table.getBoundingClientRect().right - column.right),
          hidden: box.scrollWidth - box.clientWidth,
          broken: [...table.querySelectorAll('td code')]
            .filter((code) => [...code.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && lines(node)))
            .map((code) => code.textContent),
        };
      });
      await tab.close();
      assert.deepEqual(broken, [], `at ${width} px code in a cell breaks inside a word: ${broken.join(', ')}`);
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

  it('keeps a hero with no picture one column, so its headline has the width of the page', async () => {
    // The toolchain's own 404 page: a hero of a tagline and a key, in the wide layout.
    const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${site.origin}${BASE}no-such-page/`, { waitUntil: 'networkidle' });
    const found = await tab.evaluate(() => {
      const hero = document.querySelector('.hero');
      return {
        picture: hero.querySelector(':scope > img, :scope > picture, :scope > .hero-html') !== null,
        columns: getComputedStyle(hero).gridTemplateColumns.split(' ').length,
        container: hero.parentElement.getBoundingClientRect().width >= 800,
      };
    });
    await tab.close();
    assert.deepEqual(found, { picture: false, columns: 1, container: true });
  });

  it('gives the hero and a card grid the width of a landing page, and everything else the content column', async () => {
    const tab = await browser.newPage({ viewport: { width: 1920, height: 900 } });
    await tab.goto(`${site.origin}${BASE}`, { waitUntil: 'networkidle' });
    await tab.evaluate(() => document.fonts.ready);
    const found = await tab.evaluate(() => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const column =
        Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sl-content-width')) * rem;
      const width = (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().width);
      const widest = Math.max(
        ...[...document.querySelectorAll('.sl-markdown-content > :not(.card-grid)')].map(
          (part) => part.getBoundingClientRect().width,
        ),
      );
      return { column, hero: width('.hero'), grid: width('.card-grid'), widest: Math.round(widest) };
    });
    await tab.close();
    assert.ok(found.column > 0, 'the brand sets the content column');
    assert.ok(found.hero > found.column, `the hero is ${found.hero} px wide in a column of ${found.column}`);
    assert.ok(found.grid > found.column, `the card grid is ${found.grid} px wide in a column of ${found.column}`);
    assert.ok(found.widest <= found.column, `a part of the page is ${found.widest} px wide, past ${found.column}`);
    const stated = /take the width of the page, up to about (\d+)rem/.exec(
      readFileSync(join(root, 'CONTRACT.md'), 'utf8'),
    );
    assert.equal(Number(stated?.[1]), Math.round(found.hero / 16), 'the width CONTRACT.md gives a landing page');
  });

  it('stands the selector, the page and the page index together in the middle of a wide window', async () => {
    const frame = async (width) => {
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      await tab.goto(`${site.origin}${BASE}guides/derive-a-key/`, { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      const found = await tab.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const style = getComputedStyle(document.documentElement);
        const rem = Number.parseFloat(style.fontSize);
        const [brand, tools, search, selector, sheet, index, column] = [
          'header a.site-title',
          'header .right-group',
          'site-search > button[data-open-modal]',
          '.sidebar-content',
          'main',
          'starlight-toc',
          '.sl-markdown-content',
        ].map(box);
        return {
          window: document.documentElement.clientWidth,
          before: Math.round(brand.left),
          after: Math.round(document.documentElement.clientWidth - tools.right),
          search: Math.round(search.left),
          selector: Math.round(selector.right),
          sheet: [Math.round(sheet.left), Math.round(sheet.right)],
          index: Math.round(index.left),
          column: Math.round(column.width),
          content: Math.round(Number.parseFloat(style.getPropertyValue('--sl-content-width')) * rem),
        };
      });
      await tab.close();
      return found;
    };
    const wide = await frame(2400);
    assert.ok(wide.before > 200, `a 2400 px window leaves a margin, not ${wide.before} px`);
    assert.ok(Math.abs(wide.before - wide.after) <= 1, `the margins differ: ${wide.before} and ${wide.after} px`);
    // The three parts touch but for their gutters, and the sheet is as wide as a listing of full width.
    assert.ok(
      wide.sheet[0] - wide.selector <= 16,
      `the sheet starts ${wide.sheet[0] - wide.selector} px after the selector`,
    );
    assert.ok(
      wide.index - wide.sheet[1] <= 32,
      `the page index starts ${wide.index - wide.sheet[1]} px after the sheet`,
    );
    assert.equal(wide.column, wide.content, 'the content column is as wide as the brand sets it');
    assert.ok(Math.abs(wide.search - wide.sheet[0]) <= 1, 'the search field starts where the page does');

    // A window the frame fills has no margin, and the page takes what the selector and the index leave.
    const narrow = await frame(1280);
    assert.equal(narrow.before, narrow.after);
    assert.ok(narrow.before <= 24, `a 1280 px window has a margin of ${narrow.before} px`);
    assert.ok(narrow.column < narrow.content);
  });

  it("gives a page's content column the widths CONTRACT.md states", async () => {
    const contract = readFileSync(join(root, 'CONTRACT.md'), 'utf8');
    // The table of section 7, each row as [window, rem, px], the widest column and the narrowest beside the panel as
    // [rem, px], and the window, to the nearest 10 px, that the widest column is reached in.
    const rows = [...contract.matchAll(/^\| (\d+) px \| about (\d+)rem \((\d+) px\)/gm)].map((row) =>
      row.slice(1).map(Number),
    );
    const numbers = (pattern) => pattern.exec(contract)?.slice(1).map(Number);
    const stated = {
      rows,
      widest: numbers(/The column is never wider than (\d+)rem \((\d+) px\)/),
      narrowest: numbers(/narrowest beside the panel in a window of 72rem, about (\d+)rem \((\d+) px\)/),
      reached: numbers(/A page reaches it in a window about\s+(\d+) px wide/),
    };

    const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${site.origin}${BASE}guides/derive-a-key/`, { waitUntil: 'networkidle' });
    await tab.evaluate(() => document.fonts.ready);
    /** The content column in a window `width` px wide, and the widest the brand lets it be, in px. */
    const column = async (width) => {
      await tab.setViewportSize({ width, height: 900 });
      return tab.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return [
          document.querySelector('.sl-markdown-content').getBoundingClientRect().width,
          Number.parseFloat(style.getPropertyValue('--sl-content-width')) * Number.parseFloat(style.fontSize),
        ];
      });
    };
    const about = (px) => [Math.round(px / 16), Math.round(px)];
    const measured = [];
    for (const window of WIDTHS) measured.push([window, ...about((await column(window))[0])]);
    // 1152 px is 72rem, the narrowest window with the panel beside the page.
    const [narrowest, content] = await column(1152);
    // The narrowest window that gives the page its widest column, found by halving between one too narrow and one
    // wide enough.
    let [narrow, wide] = [1152, 2400];
    assert.ok(narrowest < content && (await column(wide))[0] === content, 'a 2400 px window gives the widest column');
    while (wide - narrow > 1) {
      const middle = Math.floor((narrow + wide) / 2);
      if ((await column(middle))[0] < content) narrow = middle;
      else wide = middle;
    }
    await tab.close();

    // One comparison, so a brand release that moves the column names every number to write.
    assert.deepEqual(
      stated,
      {
        rows: measured,
        widest: [content / 16, content],
        narrowest: about(narrowest),
        reached: [Math.round(wide / 10) * 10],
      },
      'CONTRACT.md section 7 states the content column at each width the layout check loads, its widest and its narrowest',
    );
  });

  it("makes a sidebar entry and a link button as high as the brand's controls, and as a phone's in a phone's window", async () => {
    const heights = async (width) => {
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      await tab.goto(`${site.origin}${BASE}`, { waitUntil: 'networkidle' });
      const found = await tab.evaluate(() => {
        // A control token is a length, so an element that high gives it in px.
        const token = (name) => {
          const probe = document.body.appendChild(document.createElement('div'));
          probe.style.height = `var(--nc-control-${name})`;
          const height = probe.getBoundingClientRect().height;
          probe.remove();
          return height;
        };
        const least = (selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).minHeight);
        return {
          entry: least('.sidebar-content a'),
          button: least('.sl-link-button'),
          controls: [token('sm'), token('md'), token('lg')],
        };
      });
      await tab.close();
      return found;
    };
    const desk = await heights(1440);
    const [small, medium, large] = desk.controls;
    assert.ok(0 < small && small < medium && medium < large, `the brand's controls are ${desk.controls} px high`);
    assert.deepEqual([desk.entry, desk.button], [small, medium]);
    const held = await heights(390);
    assert.deepEqual([held.entry, held.button], [large, large]);
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

  it("draws inline code on the brand's code tint, with no edge, in the light and the dark scheme", async () => {
    const drawn = async (colorScheme) => {
      const tab = await browser.newPage({ colorScheme });
      await tab.goto(`${site.origin}${BASE}quick-start/`, { waitUntil: 'networkidle' });
      const found = await tab.evaluate(() => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.backgroundColor = 'var(--nc-color-code-tint)';
        const tint = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const style = getComputedStyle(document.querySelector('.sl-markdown-content p:not(.starlight-aside *) > code'));
        return { tint, background: style.backgroundColor, edge: style.borderTopStyle };
      });
      await tab.close();
      return found;
    };
    const light = await drawn('light');
    const dark = await drawn('dark');
    for (const [scheme, found] of Object.entries({ light, dark })) {
      // An undefined token computes to transparent on the code and on the probe alike, so equality alone would pass.
      assert.notEqual(found.tint, 'rgba(0, 0, 0, 0)', `the brand defines no code tint in the ${scheme} scheme`);
      assert.deepEqual({ background: found.background, edge: found.edge }, { background: found.tint, edge: 'none' });
    }
    assert.notEqual(dark.tint, light.tint, 'the dark scheme draws its own code tint');
  });

  it('asks no other origin for anything', () => {
    const elsewhere = requested.filter(
      (url) => !url.startsWith(site.origin) && !url.startsWith('data:') && !url.startsWith('blob:'),
    );
    assert.deepEqual(elsewhere, []);
    assert.deepEqual(errors, [], 'script errors on the pages');
  });
});
