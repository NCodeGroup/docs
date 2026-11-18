// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The layout check: a Chromium-based browser driven over its DevTools pipe opens a page at a width, the check finds
// the browser and the built pages, measures each page at each width and words what it found, and "site.mjs check"
// runs it from the command line. A browser that does not start is reported by name.
//
// The browser is the headless Chromium that the locked playwright-core names. "npm run browser" downloads it.
// Where it is not installed the tests are skipped and say so; DOCS_REQUIRE_BROWSER=1 makes that a failure,
// as CI sets it.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { before, describe, it } from 'node:test';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { launchBrowser } from '../src/layout/browser.mjs';
import { checkLayout, findBrowser, layoutMessage, sitePages } from '../src/layout/check.mjs';
import { resolveLibrary } from '../src/library.mjs';
import { build, copyOfFixture, fixture, root, work } from './helpers.mjs';

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
  // Runs `node scripts/site.mjs check` on a built site, as the workflow does.
  function check(library, out) {
    const environment = { ...process.env, NO_COLOR: '1' };
    // A site URL, a library or a browser in the environment of whoever runs the tests is not the tests' input.
    for (const key of [
      'SITE_URL',
      'DOCS_LIBRARY',
      'DOCS_CONTENT',
      'DOCS_OUT',
      'DOCS_BROWSER',
      'CHROME_BIN',
      'INIT_CWD',
    ])
      delete environment[key];
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'site.mjs'), 'check', library, '--out', out, '--browser', executable],
      { cwd: root, env: environment, encoding: 'utf8', timeout: 180_000 },
    );
    return { code: result.status ?? 1, output: `${result.stdout}\n${result.stderr}` };
  }

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

  it('fails a command the browser does not answer in time', async () => {
    const browser = await launchBrowser(executable, { commandTimeout: 1000 });
    try {
      const page = await browser.newPage();
      await assert.rejects(page.evaluate('new Promise(() => {})'), /did not answer Runtime\.evaluate in 1 s/);
    } finally {
      await browser.close();
    }
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
      const pages = sitePages(resolveLibrary({ DOCS_LIBRARY: fixture }), out);
      // A site with no pages would pass vacuously.
      const paths = pages.map((page) => page.path);
      assert.ok(paths.includes(''));
      assert.ok(paths.includes('reference/behaviour/'));
      assert.ok(paths.includes('concepts/how-sealing-works/'));
      const problems = await checkLayout({ out, base: BASE, pages, browser: executable });
      assert.deepEqual(problems, []);
    });

    it('closes the site when the browser does not start', async () => {
      // A server left open would keep the test process from exiting.
      await assert.rejects(
        checkLayout({
          out: join(work, 'out', 'layout'),
          base: BASE,
          pages: [],
          browser: join(work, 'no-such-browser'),
        }),
        /did not start/,
      );
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

    it('passes the fixture from the command line', () => {
      const result = check(fixture, join(work, 'out', 'layout'));
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /The layout of [1-9]\d* pages fits/);
    });

    it('fails from the command line, naming the page, the width and the element', () => {
      const library = copyOfFixture('layout-cli');
      const component = join(library, 'docs', 'site', '_components', 'MemoryMap.astro');
      const text = readFileSync(component, 'utf8');
      // The attribute, not the comment above it that also names data-scrolls.
      const changed = text.replace(' data-scrolls tabindex', ' tabindex');
      assert.notEqual(changed, text);
      writeFileSync(component, changed);
      const built = build('layout-cli', { library });
      assert.equal(built.code, 0, built.output);
      const result = check(library, built.out);
      assert.equal(result.code, 1, result.output);
      assert.match(
        result.output,
        /docs\/site\/concepts\/how-sealing-works\.mdx at 1440 px: section\.memory-map\.not-content, under "Layout in memory", hides \d+ px of its content sideways/,
      );
      assert.match(result.output, /data-scrolls/);
    });

    it('says when the site is not built', () => {
      const empty = join(work, 'layout-empty');
      rmSync(empty, { recursive: true, force: true });
      mkdirSync(empty, { recursive: true });
      const result = check(fixture, empty);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /No built site in/);
    });
  });
});
