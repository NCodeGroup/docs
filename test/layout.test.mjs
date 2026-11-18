// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The layout check's browser: a Chromium-based browser driven over its DevTools pipe opens a page at a width,
// and a browser that does not start is reported by name.
//
// The browser is the headless Chromium that the locked playwright-core names. "npm run browser" downloads it.
// Where it is not installed the tests are skipped and say so; DOCS_REQUIRE_BROWSER=1 makes that a failure,
// as CI sets it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { launchBrowser } from '../src/layout/browser.mjs';
import { work } from './helpers.mjs';

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
});
