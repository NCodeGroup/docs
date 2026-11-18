// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The layout check (ADR-1013): it loads each built page in a Chromium-based browser at a few widths and reports
// an element that leaves its content column or hides content sideways. This file finds the browser, lists the
// pages to load, measures each page at each width and words the message.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listPages } from '../library.mjs';
import { launchBrowser } from './browser.mjs';
import { serve } from './serve.mjs';

/** The widths, in px, that each page is loaded at: a wide screen, a laptop, a tablet and a phone. */
export const WIDTHS = [1440, 1280, 1024, 390];

/**
 * The browser to check with: DOCS_BROWSER, else CHROME_BIN (GitHub's Ubuntu images set it to Google Chrome), else
 * the browser that "npm run browser" installs, which playwright-core names when it is installed.
 * @param {Record<string, string | undefined>} [environment]
 * @returns {Promise<string>} The path or command of the browser.
 * @throws {Error} When none is named and none is installed.
 */
export async function findBrowser(environment = process.env) {
  if (environment.DOCS_BROWSER) return environment.DOCS_BROWSER;
  if (environment.CHROME_BIN) return environment.CHROME_BIN;
  try {
    const { chromium } = await import('playwright-core');
    const server = await chromium.launchServer();
    const executable = server.process().spawnfile;
    await server.close();
    return executable;
  } catch {
    throw new Error(
      'No browser to check the layout with: name a Chromium-based browser, such as Google Chrome or Microsoft Edge, with --browser or DOCS_BROWSER, or run "npm run browser" in the toolchain.',
    );
  }
}

/**
 * The built pages of a library, as the folder `out` holds them. A page that was not built is left out.
 * @param {{ contentPath: string, contentDirectory: string }} library
 * @param {string} out The folder of the built site.
 * @returns {{ name: string, path: string }[]} `name` is the page as its author knows it, and `path` is its URL
 *   path under the site's base, `''` for the landing page, else with a final `/`.
 */
export function sitePages(library, out) {
  const pages = [];
  for (const page of listPages(library)) {
    const path = page.slug === 'index' ? '' : `${page.slug.replace(/\/index$/, '')}/`;
    if (!existsSync(join(out, ...path.split('/').filter(Boolean), 'index.html'))) continue;
    pages.push({ name: `${library.contentPath}/${page.path}`, path });
  }
  return pages;
}

// This function runs in the page, not in Node: the browser takes its source text, so it uses only browser globals.
function measure() {
  const found = [];
  const headings = [...document.querySelectorAll('main :is(h1, h2, h3, h4, h5, h6)')];
  const describe = (element) =>
    element.localName +
    (element.id ? `#${element.id}` : '') +
    [...element.classList]
      .filter((name) => !name.startsWith('astro-'))
      .map((name) => `.${name}`)
      .join('');
  const under = (element) =>
    headings
      .filter((heading) => heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      .at(-1)
      ?.textContent.trim();
  const visit = (parent, column) => {
    for (const element of parent.children) {
      if (getComputedStyle(element).display === 'contents') {
        visit(element, column);
        continue;
      }
      const box = element.getBoundingClientRect();
      // Hidden, or kept for screen readers only.
      if (box.width <= 1 || box.height <= 1) continue;
      const past = Math.round(Math.max(box.right - column.right, column.left - box.left));
      const hidden = element.scrollWidth - element.clientWidth;
      if (past > 1) {
        found.push({
          element: describe(element),
          heading: under(element),
          problem: `extends ${past} px past the content column`,
        });
      } else if (element.matches('.expressive-code, [data-scrolls]')) {
      } else if (getComputedStyle(element).overflowX !== 'visible' && hidden > 1) {
        found.push({
          element: describe(element),
          heading: under(element),
          problem: `hides ${hidden} px of its content sideways`,
        });
      } else {
        visit(element, column);
      }
    }
  };
  for (const container of document.querySelectorAll('main .sl-container')) {
    visit(container, container.getBoundingClientRect());
  }
  return found;
}

/**
 * Loads each page at each width and measures it.
 * @param {{ out: string, base: string, pages: { name: string, path: string }[], browser: string, widths?: number[] }} options
 *   `out` is the built site, `base` its base path, `pages` what `sitePages` lists and `browser` the browser's path.
 * @returns {Promise<{ page: string, width: number, element: string, heading?: string, problem: string }[]>}
 */
export async function checkLayout({ out, base, pages, browser, widths = WIDTHS }) {
  const site = await serve(out, base);
  let chrome;
  try {
    chrome = await launchBrowser(browser);
  } catch (error) {
    await site.close();
    throw error;
  }
  try {
    const page = await chrome.newPage();
    const problems = [];
    for (const { name, path } of pages) {
      for (const width of widths) {
        await page.setWidth(width);
        await page.goto(`${site.origin}${base.replace(/\/$/, '')}/${path}`);
        const found = await page.evaluate(`document.fonts.ready.then(() => (${measure})())`);
        for (const problem of found) problems.push({ page: name, width, ...problem });
      }
    }
    return problems;
  } finally {
    await chrome.close();
    await site.close();
  }
}

/**
 * The message for the problems the check found.
 * @param {{ page: string, width: number, element: string, heading?: string, problem: string }[]} problems
 * @returns {string}
 */
export function layoutMessage(problems) {
  const first =
    problems.length === 1 ? 'The layout check found a problem:' : `The layout check found ${problems.length} problems:`;
  const lines = problems.map(
    ({ page, width, element, heading, problem }) =>
      `  ${page} at ${width} px: ${element}${heading === undefined ? '' : `, under "${heading}"`}, ${problem}`,
  );
  const last =
    "Each element of a page fits its content column, about 36rem at 1280 px (CONTRACT.md, section 7): let a table's cells wrap, lay wide data out as a card per entry, and mark an element that scrolls sideways by design with data-scrolls.";
  return [first, ...lines, last].join('\n');
}
