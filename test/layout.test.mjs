// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The layout check's browser: a Chromium-based browser driven over its DevTools pipe opens a page at a width,
// and a browser that does not start is reported by name.
//
// The browser is the headless Chromium that the locked playwright-core names. "npm run browser" downloads it.
// Where it is not installed the tests are skipped and say so; DOCS_REQUIRE_BROWSER=1 makes that a failure,
// as CI sets it.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { launchBrowser } from '../src/layout/browser.mjs';
import { checkLayout, findBrowser, layoutMessage, sitePages } from '../src/layout/check.mjs';
import { resolveLibrary } from '../src/library.mjs';
import { build, copyOfFixture, fixture, work } from './helpers.mjs';

let executable;
let missing;
try {
  const server = await chromium.launchServer();
  executable = server.process().spawnfile;
  await server.close();
} catch (error) {
  if (process.env.DOCS_REQUIRE_BROWSER)
    throw new Error(
      `DOCS_REQUIRE_BROWSER is set, but the browser did not start. Run "npm run browser" first.\n${error.message}`,
    );
  missing = `the browser did not start, and "npm run browser" installs it: ${error.message.split('\n')[0]}`;
}

describe('the layout check', { skip: executable ? false : missing }, () => {
  it('opens a page at a width', async () => {
    const browser = await launchBrowser(executable);
    try {
      const page = await browser.newPage();
      await page.setWidth(1024);
      await page.goto('data:text/html,<p>A page</p>');
      assert.equal(await page.evaluate('innerWidth'), 1024);
    } finally {
      await browser.close();
    }
  });

  it('says when the browser does not start', async () => {
    await assert.rejects(launchBrowser(join(work, 'no-such-browser')), /did not start/);
  });

  it('finds the browser the environment names, else the one the toolchain installs', async () => {
    assert.equal(await findBrowser({ DOCS_BROWSER: 'a', CHROME_BIN: 'b' }), 'a');
    assert.equal(await findBrowser({ CHROME_BIN: 'b' }), 'b');
    assert.equal(await findBrowser({}), executable);
  });

  it('lists the pages that the build wrote', () => {
    const folder = join(work, 'layout-pages');
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(join(folder, 'quick-start'), { recursive: true });
    writeFileSync(join(folder, 'index.html'), '');
    writeFileSync(join(folder, 'quick-start', 'index.html'), '');
    assert.deepEqual(sitePages(resolveLibrary({ DOCS_LIBRARY: fixture }), folder), [
      { name: 'docs/site/index.mdx', path: '' },
      { name: 'docs/site/quick-start.mdx', path: 'quick-start/' },
    ]);
  });

  it('words the problems the check found', () => {
    const message = layoutMessage([
      {
        page: 'docs/site/a.mdx',
        width: 390,
        element: 'table.x',
        heading: 'Reference',
        problem: 'is 40 px past the column',
      },
      { page: 'docs/site/b.mdx', width: 1280, element: 'div.y', problem: 'hides 12 px of content sideways' },
    ]);
    assert.ok(message.startsWith('The layout check found 2 problems:\n'));
    assert.ok(
      message.includes('\n  docs/site/a.mdx at 390 px: table.x, under "Reference", is 40 px past the column\n'),
    );
    assert.ok(message.includes('\n  docs/site/b.mdx at 1280 px: div.y, hides 12 px of content sideways\n'));
    assert.ok(message.includes('data-scrolls'));
  });

  describe('on a built site', () => {
    const BASE = '/Fixture/';

    before(() => {
      const result = build('layout');
      assert.equal(result.code, 0, result.output);
    });

    it('passes every page of the fixture at every width', async () => {
      const out = join(work, 'out', 'layout');
      const problems = await checkLayout({
        out,
        base: BASE,
        pages: sitePages(resolveLibrary({ DOCS_LIBRARY: fixture }), out),
        browser: executable,
      });
      assert.deepEqual(problems, []);
    });

    it('reports an element past the column and a box that hides its content, and leaves a marked scroller alone', async () => {
      const library = copyOfFixture('layout-wide');
      const names = [
        'One',
        'Two',
        'Three',
        'Four',
        'Five',
        'Six',
        'Seven',
        'Eight',
        'Nine',
        'Ten',
        'Eleven',
        'Twelve',
        'Thirteen',
        'Fourteen',
        'Fifteen',
        'Sixteen',
      ];
      const table = [
        `| ${names.join(' | ')} |`,
        `| ${names.map(() => '---').join(' | ')} |`,
        `| ${names.map(() => 'alpha').join(' | ')} |`,
      ].join('\n');
      writeFileSync(
        join(library, 'docs', 'site', 'guides', 'wide.md'),
        [
          '---',
          'title: Wide',
          '---',
          '',
          '<div class="too-wide" style="width: 72rem">A row wider than any content column.</div>',
          '',
          '<div class="hides" style="overflow-x: auto"><div style="width: 72rem">Content past the right edge.</div></div>',
          '',
          '<div class="marked" data-scrolls style="overflow-x: auto"><div style="width: 72rem">Content that scrolls by design.</div></div>',
          '',
          table,
          '',
        ].join('\n'),
      );
      const result = build('layout-wide', { library });
      assert.equal(result.code, 0, result.output);
      const problems = await checkLayout({
        out: result.out,
        base: BASE,
        pages: [{ name: 'docs/site/guides/wide.md', path: 'guides/wide/' }],
        browser: executable,
      });
      for (const problem of problems) {
        assert.equal(problem.heading, 'Wide');
        assert.match(
          problem.problem,
          /^(extends \d+ px past the content column|hides \d+ px of its content sideways)$/,
        );
      }
      const at = (width) => problems.filter((problem) => problem.width === width).map((problem) => problem.element);
      for (const width of [1440, 1280, 1024])
        assert.deepEqual(at(width), ['div.too-wide', 'div.hides', 'div.ncode-table']);
      assert.deepEqual(at(390), ['div.too-wide', 'div.hides']);
    });
  });
});
