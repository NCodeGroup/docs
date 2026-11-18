// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The library module: the pages of a library and the commit its checkout is at.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { listPages, pageSlug, readCommit, resolveLibrary } from '../src/library.mjs';
import { copyOfFixture, fixture, root, work } from './helpers.mjs';

const FIXTURE_PAGES = [
  'concepts/how-sealing-works.mdx',
  'guides/ban-apis.mdx',
  'guides/derive-a-key.mdx',
  'guides/extension-members.mdx',
  'index.mdx',
  'quick-start.mdx',
  'reference/api.mdx',
];

/** Writes a file under a copy of the fixture, with the folders it needs. */
const add = (library, path) => {
  const file = join(library, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '# A page\n');
};

describe('a library', () => {
  it('names a page by its slug', () => {
    assert.equal(pageSlug('guides/Derive-A-Key.mdx'), 'guides/derive-a-key');
    assert.equal(pageSlug('index.mdx'), 'index');
    assert.equal(pageSlug('guides/index.mdx'), 'guides/index');
    assert.equal(pageSlug('guides\\Derive-A-Key.md'), 'guides/derive-a-key');
  });

  it('lists its pages, sorted by path', () => {
    const pages = listPages(resolveLibrary({ DOCS_LIBRARY: fixture }));
    assert.deepEqual(
      pages.map((page) => page.path),
      FIXTURE_PAGES,
    );
    assert.deepEqual(pages[2], {
      file: join(fixture, 'docs', 'site', 'guides', 'derive-a-key.mdx'),
      path: 'guides/derive-a-key.mdx',
      slug: 'guides/derive-a-key',
    });
  });

  it('leaves out its 404 page, and files and folders that start with _ or .', () => {
    const copy = copyOfFixture('pages');
    add(copy, 'docs/site/404.md');
    add(copy, 'docs/site/_drafts/x.mdx');
    add(copy, 'docs/site/.hidden.mdx');
    const pages = listPages(resolveLibrary({ DOCS_LIBRARY: copy }));
    assert.deepEqual(
      pages.map((page) => page.path),
      FIXTURE_PAGES,
    );
  });

  it('lists a page in a folder with capitals under its lower-case slug', () => {
    const copy = copyOfFixture('pages-upper');
    // A folder name the fixture has no folder of in other case: a case-insensitive file system
    // would put Guides/Upper.mdx into the fixture's guides folder.
    add(copy, 'docs/site/Notes/Upper.mdx');
    const pages = listPages(resolveLibrary({ DOCS_LIBRARY: copy }));
    assert.ok(pages.some((page) => page.path === 'Notes/Upper.mdx' && page.slug === 'notes/upper'));
  });

  it('reads the commit of its checkout', () => {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    assert.deepEqual(readCommit(resolveLibrary({ DOCS_LIBRARY: fixture })), { commit: head });
  });

  it('has no commit and no reason in a folder in no repository', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ncode-docs-'));
    try {
      assert.deepEqual(readCommit({ root: folder }), { commit: undefined, reason: undefined });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('has no commit, with git failing to run as the reason, where git is not installed', () => {
    const noGit = join(work, 'no-git');
    mkdirSync(noGit, { recursive: true });
    const result = readCommit(resolveLibrary({ DOCS_LIBRARY: fixture }), { PATH: noGit });
    assert.equal(result.commit, undefined);
    assert.ok(result.reason?.endsWith('spawnSync git ENOENT'), result.reason);
  });
});
