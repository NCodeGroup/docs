// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Every site has a 404 page: the library's own 404.mdx or 404.md, or else the toolchain's. None is
// built as a page of its own, and the build prints no warning.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ownNotFoundPage } from '../src/library.mjs';
import { build, copyOfFixture, fixture } from './helpers.mjs';

/** The lines of a build's output that warn, except the one every build prints. */
const warnings = (output) =>
  output.split('\n').filter((line) => line.includes('[WARN]') && !line.includes('data store cleared (force)'));

// Its hero action's icon is an inline <svg>: the toolchain's own page covers an icon name.
const OWN_PAGE = [
  '---',
  'title: Lost',
  'template: splash',
  'hero:',
  '  tagline: A page of the library itself.',
  '  actions:',
  '    - text: Start over',
  '      link: /quick-start/',
  '      icon: \'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16"/></svg>\'',
  '---',
  '',
  "import { Braces } from '@ncodegroup/docs/components';",
  '',
  'Nothing lives at <Braces>this address</Braces>.',
  '',
].join('\n');

describe('a library without a 404 page', () => {
  const result = build('not-found-default');

  it('builds without a warning', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(warnings(result.output), []);
    assert.equal(
      ownNotFoundPage({ contentDirectory: join(fixture, 'docs', 'site'), contentPath: 'docs/site' }),
      undefined,
    );
  });

  it("gets the toolchain's page, with the search box and a link to the site's start", () => {
    const html = readFileSync(join(result.out, '404.html'), 'utf8');
    assert.match(html, /<title>Page not found \| NCode\.Fixture<\/title>/);
    assert.match(html, /Nothing is published at this address/);
    assert.match(html, /<a[^>]+class="sl-link-button[^"]*"[^>]*href="\/Fixture\/"/);
    assert.match(html, /<site-search/);
    assert.doesNotMatch(html, /data-pagefind-body/);
    assert.doesNotMatch(html, /\/edit\/main\//);
    assert.ok(!existsSync(join(result.out, '404', 'index.html')), 'no /404/ page is built');
  });
});

describe('a library with its own 404.md', () => {
  const library = copyOfFixture('own-not-found-md');
  writeFileSync(join(library, 'docs/site/404.md'), '---\ntitle: Lost in Markdown\n---\n\nA plain Markdown page.\n');
  const result = build('own-not-found-md', { library });

  it('keeps its own page', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(warnings(result.output), []);
    assert.equal(
      ownNotFoundPage({ contentDirectory: join(library, 'docs', 'site'), contentPath: 'docs/site' }),
      '404.md',
    );
    const html = readFileSync(join(result.out, '404.html'), 'utf8');
    assert.match(html, /<title>Lost in Markdown \| NCode\.Fixture<\/title>/);
    assert.doesNotMatch(html, /Page not found/);
    assert.ok(!existsSync(join(result.out, '404', 'index.html')), 'no /404/ page is built');
  });
});

describe('a library with its own 404.mdx', () => {
  const library = copyOfFixture('own-not-found');
  writeFileSync(join(library, 'docs/site/404.mdx'), OWN_PAGE);
  const result = build('own-not-found', { library });

  it('builds without a warning', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(warnings(result.output), []);
  });

  it('keeps its own page', () => {
    const html = readFileSync(join(result.out, '404.html'), 'utf8');
    assert.match(html, /<title>Lost \| NCode\.Fixture<\/title>/);
    assert.match(html, /A page of the library itself/);
    assert.match(html, /Nothing lives at/);
    assert.match(html, /ncode-braces/);
    assert.match(html, /<a[^>]+class="sl-link-button[^"]*"[^>]*href="\/Fixture\/quick-start\/"/);
    assert.match(html, /<path d="M4 12h16"/);
    assert.doesNotMatch(html, /Page not found/);
    assert.ok(!existsSync(join(result.out, '404', 'index.html')), 'no /404/ page is built');
  });
});

describe('a 404 page whose hero action is written with the base path', () => {
  const library = copyOfFixture('base-in-404');
  writeFileSync(
    join(library, 'docs/site/404.mdx'),
    OWN_PAGE.replace('link: /quick-start/', 'link: /Fixture/quick-start/'),
  );
  const result = build('base-in-404', { library });

  it("fails the build, and names the library's own file", () => {
    assert.notEqual(result.code, 0, `the build should have failed:\n${result.output}`);
    assert.match(
      result.output,
      /docs\/site\/404\.mdx \(hero action "Start over"\): the link \/Fixture\/quick-start\/ starts with the site's base path/,
    );
  });
});

describe('a library with both 404.mdx and 404.md', () => {
  const library = copyOfFixture('both-not-found');
  writeFileSync(join(library, 'docs/site/404.mdx'), '---\ntitle: From MDX\n---\n\nMDX page.\n');
  writeFileSync(join(library, 'docs/site/404.md'), '---\ntitle: From MD\n---\n\nMD page.\n');
  const result = build('both-not-found', { library });

  it('fails the build, and names both files', () => {
    assert.notEqual(result.code, 0, `the build should have failed:\n${result.output}`);
    assert.match(
      result.output,
      /docs\/site\/404\.mdx and docs\/site\/404\.md are both the site's 404 page: keep one of them\./,
    );
  });
});
