// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The fixture library builds, under a base path and at the root of a domain, and what it builds is
// right: the samples are in the pages, no marker line is, and nothing links outside the base.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { lockFile, readLastUpdated } from '../src/library.mjs';
import { build, copyOfFixture, pages, root, siteAbsoluteUrls, work } from './helpers.mjs';

const EXPECTED_PAGES = [
  '404.html',
  'concepts/how-sealing-works/index.html',
  'guides/ban-apis/index.html',
  'guides/derive-a-key/index.html',
  'guides/extension-members/index.html',
  'index.html',
  'quick-start/index.html',
  'reference/api/index.html',
];

/** A page's text as a reader sees it: tags removed, entities decoded, whitespace collapsed. */
const text = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function checkSamples(out) {
  const page = (file) => text(readFileSync(join(out, file), 'utf8'));
  const quickStart = page('quick-start/index.html');
  assert.match(
    quickStart,
    /using var vault = Vault\.Rent\(32, out Span<byte> key\);/,
    'the QuickStart sample is in the quick start',
  );
  assert.match(quickStart, /QuickStart\.cs/, 'the sample block has its title');
  assert.match(
    page('guides/derive-a-key/index.html'),
    /RandomNumberGenerator\.Fill\(salt\);/,
    'the DeriveKey sample is in its guide',
  );
  const extensions = page('guides/extension-members/index.html');
  assert.match(extensions, /extension\(Vault vault\)/, 'the C# 14 extension block is in its guide');
  assert.match(extensions, /public static Vault RentKey\(\) => Vault\.Rent\(32, out _\);/);
  for (const { file, html } of pages(out)) {
    assert.doesNotMatch(html, /begin-snippet|end-snippet/, `${file} shows a marker line`);
    assert.doesNotMatch(html, /snippet=/, `${file} shows a sample reference`);
  }
}

function checkIncludes(out) {
  const html = readFileSync(join(out, 'guides/ban-apis/index.html'), 'utf8');
  const shown = text(html);
  assert.ok(
    shown.includes(`<ItemGroup Condition="!$(MSBuildProjectName.EndsWith('.Tests'))">`),
    'the lines of Directory.Build.props are on the page',
  );
  assert.match(shown, /<AdditionalFiles Include=/);
  assert.match(shown, /Directory\.Build\.props/, 'the block is titled with its path');
  assert.match(shown, /The banned symbols/, "an author's title is kept");
  assert.match(shown, /uses: NCodeGroup\/docs\//, 'the lines of the workflow are on the page');

  const workflow = readFileSync(join(root, 'fixture', '.github', 'workflows', 'docs.yml'), 'utf8').split(/\r\n|\r|\n/);
  const usesLine = workflow.findIndex((line) => line.includes('uses: NCodeGroup/docs/')) + 1;
  assert.ok(usesLine > 0, 'the fixture workflow has the line the page selects');

  const captions = [...html.matchAll(/<p class="ncode-source">.*?<\/p>/gs)].map(([paragraph]) => paragraph);
  assert.equal(captions.length, 3, 'each file block has a caption');
  assert.match(
    captions[0],
    /https:\/\/github\.com\/NCodeGroup\/Fixture\/blob\/[0-9a-f]{40}\/Directory\.Build\.props#L3-L5"/,
  );
  assert.match(captions[1], /https:\/\/github\.com\/NCodeGroup\/Fixture\/blob\/[0-9a-f]{40}\/BannedSymbols\.txt"/);
  assert.match(
    captions[2],
    new RegExp(
      `https://github\\.com/NCodeGroup/Fixture/blob/[0-9a-f]{40}/\\.github/workflows/docs\\.yml#L${usesLine}"`,
    ),
  );

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/, 'git reads the commit of the repository');
  assert.ok(shown.includes(`Directory.Build.props, lines 3–5 at ${head.slice(0, 7)}`), 'the caption names the commit');

  for (const { file, html: built } of pages(out)) {
    assert.doesNotMatch(text(built), /file=/, `${file} shows a file reference`);
  }
}

describe('the fixture under the base path /Fixture/', () => {
  const result = build('fixture');

  it('builds', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(
      pages(result.out)
        .map(({ file }) => file)
        .sort(),
      EXPECTED_PAGES,
    );
    assert.match(result.output, /All internal links are valid/);
    assert.ok(existsSync(join(result.out, 'pagefind', 'pagefind.js')), 'the search index was built');
  });

  it('gives Starlight its collection of UI strings, so Astro does not warn that it is empty', () => {
    assert.doesNotMatch(result.output, /collection "i18n" does not exist or is empty/);
  });

  it('includes the samples and never a marker line', () => checkSamples(result.out));

  it('shows the repository files a page includes, linked at the commit', () => checkIncludes(result.out));

  it('links nowhere outside the base', () => {
    let checked = 0;
    for (const { file, html } of pages(result.out)) {
      for (const url of siteAbsoluteUrls(html)) {
        assert.ok(url === '/Fixture' || url.startsWith('/Fixture/'), `${file} links to ${url}, outside /Fixture/`);
        checked++;
      }
    }
    assert.ok(checked > 100, `only ${checked} site-absolute URLs were found`);
  });

  it('adds the base to links an author wrote without it', () => {
    const home = readFileSync(join(result.out, 'index.html'), 'utf8');
    // A hero action, a Markdown link inside a component, and a LinkCard.
    assert.match(home, /<a[^>]+href="\/Fixture\/quick-start\/"[^>]*>\s*Get started/);
    assert.match(home, /href="\/Fixture\/concepts\/how-sealing-works\/"/);
    assert.match(home, /href="\/Fixture\/guides\/derive-a-key\/"/);
    const guide = readFileSync(join(result.out, 'guides/derive-a-key/index.html'), 'utf8');
    assert.match(guide, /href="\/Fixture\/quick-start\/#seal-a-secret"/, 'a Markdown link with a fragment');
    assert.match(
      guide,
      /class="sl-link-button[^"]*"[^>]*href="\/Fixture\/guides\/extension-members\/"/,
      'a LinkButton',
    );
    assert.match(guide, /href="https:\/\/cheatsheetseries\.owasp\.org\//, 'an external link is left alone');
    const api = readFileSync(join(result.out, 'reference/api/index.html'), 'utf8');
    assert.match(
      api,
      /<a[^>]+href="\/Fixture\/quick-start\/"[^>]*rel="next"|<a[^>]+rel="next"[^>]*href="\/Fixture\/quick-start\/"/,
      'a next link from frontmatter',
    );
  });

  it("serves the library's images from under the base", () => {
    const concept = readFileSync(join(result.out, 'concepts/how-sealing-works/index.html'), 'utf8');
    assert.match(concept, /<img[^>]+src="\/Fixture\/_astro\/lifecycle\.[^"]+\.webp"/, 'a Markdown image, optimized');
    assert.match(concept, /<img[^>]+src="\/Fixture\/_astro\/lifecycle\.[^"]+\.svg"/, 'an imported image');
    assert.match(concept, /byte-grid/, "the library's own component rendered");
  });

  it("names the library's repository in edit links, and the site in titles", () => {
    const quickStart = readFileSync(join(result.out, 'quick-start/index.html'), 'utf8');
    assert.match(
      quickStart,
      /href="https:\/\/github\.com\/NCodeGroup\/Fixture\/edit\/main\/docs\/site\/quick-start\.mdx"/,
    );
    assert.match(quickStart, /<title>Quick start \| NCode\.Fixture<\/title>/);
    assert.match(quickStart, /<link rel="canonical" href="https:\/\/ncodegroup\.github\.io\/Fixture\/quick-start\/"/);
    assert.match(readFileSync(join(result.out, 'index.html'), 'utf8'), /<title>NCode\.Fixture<\/title>/);
  });

  it('loads fonts and scripts from the site itself', () => {
    for (const { file, html } of pages(result.out)) {
      const external = [
        ...html.matchAll(
          /<(?:script|link|img|source|iframe)\b[^>]*\s(?:src|href)="(https?:)?\/\/([^"/]+)[^"]*"[^>]*>/g,
        ),
      ]
        .filter(([tag]) => !/rel="(canonical|me|sitemap|alternate)"/.test(tag))
        .map(([, , host]) => host);
      assert.deepEqual(external, [], `${file} loads from another origin`);
    }
  });
});

describe('the fixture at the root of a domain', () => {
  const result = build('root', { args: ['--site-url', 'https://docs.example.test'] });

  it('builds', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(
      pages(result.out)
        .map(({ file }) => file)
        .sort(),
      EXPECTED_PAGES,
    );
  });

  it('includes the samples and never a marker line', () => checkSamples(result.out));

  it('shows the repository files a page includes, linked at the commit', () => checkIncludes(result.out));

  it('has no trace of another base path', () => {
    for (const { file, html } of pages(result.out)) {
      for (const url of siteAbsoluteUrls(html)) assert.ok(!url.startsWith('/Fixture'), `${file} links to ${url}`);
    }
    const home = readFileSync(join(result.out, 'index.html'), 'utf8');
    assert.match(home, /<a[^>]+href="\/quick-start\/"[^>]*>\s*Get started/);
    assert.match(home, /<link rel="canonical" href="https:\/\/docs\.example\.test\/"/);
    const api = readFileSync(join(result.out, 'reference/api/index.html'), 'utf8');
    assert.match(
      api,
      /<a[^>]+href="\/quick-start\/"[^>]*rel="next"|<a[^>]+rel="next"[^>]*href="\/quick-start\/"/,
      'a next link from frontmatter',
    );
  });
});

describe('a page written as plain Markdown', () => {
  const library = copyOfFixture('plain-markdown');
  writeFileSync(
    join(library, 'docs/site/guides/plain.md'),
    [
      '---',
      'title: Plain Markdown',
      '---',
      '',
      'A [Markdown link](/quick-start/), <a href="/quick-start/#seal-a-secret">an HTML link</a>,',
      '<a class="key" href=\'/guides/derive-a-key/\'>one in single quotes</a>',
      'and <a href="https://example.test/">an external one</a>.',
      '',
      '<p>',
      '  <img src="/favicon.svg" alt="The mark" width="32"> <a href=/reference/api/>a bare one</a>',
      '</p>',
      '',
      'A link shown as code is text, not a link: `<a href="/nowhere/">`.',
      '',
    ].join('\n'),
  );
  const result = build('plain-markdown', { library });

  it('builds beside the .mdx pages', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(
      pages(result.out)
        .map(({ file }) => file)
        .sort(),
      [...EXPECTED_PAGES, 'guides/plain/index.html'].sort(),
    );
  });

  it('gets the base on links and images written as HTML, and on none shown as code', () => {
    const plain = readFileSync(join(result.out, 'guides/plain/index.html'), 'utf8');
    assert.match(plain, /<a href="\/Fixture\/quick-start\/">Markdown link<\/a>/);
    assert.match(plain, /<a href="\/Fixture\/quick-start\/#seal-a-secret">an HTML link<\/a>/);
    assert.match(plain, /<a class="key" href='\/Fixture\/guides\/derive-a-key\/'>one in single quotes<\/a>/);
    assert.match(plain, /<a href=\/Fixture\/reference\/api\/>a bare one<\/a>/);
    assert.match(plain, /<a href="https:\/\/example\.test\/">an external one<\/a>/);
    assert.match(plain, /<img src="\/Fixture\/favicon\.svg" alt="The mark" width="32">/);
    assert.match(plain, /&lt;a href="\/nowhere\/"&gt;/);
  });
});

describe('a checkout that is already building a library', () => {
  it('refuses a second build, and says who holds it', () => {
    // This test's own process stands in for a build that is still running.
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, library: '/somewhere/Other' }));
    try {
      const result = build('locked');
      assert.equal(result.code, 1, result.output);
      assert.match(
        result.output,
        new RegExp(`This toolchain checkout is in use: process ${process.pid} is building or serving /somewhere/Other`),
      );
      assert.doesNotMatch(result.output, /Mounted/);
    } finally {
      rmSync(lockFile, { force: true });
    }
  });

  it('takes over from a build that is gone', () => {
    // No process has this id: the largest a Linux kernel gives out is 4194304.
    writeFileSync(lockFile, JSON.stringify({ pid: 2 ** 30, library: '/somewhere/Other' }));
    const result = build('unlocked');
    assert.equal(result.code, 0, result.output);
    assert.ok(!existsSync(lockFile), 'the lock is released when the build ends');
  });
});

describe("an output folder outside the toolchain whose path starts with the toolchain's", () => {
  it('stops the build before it starts, and says why', () => {
    // Such as ../docs-site beside a toolchain at ../docs, which Astro takes for a folder inside it.
    const toolchain = root.replace(/[\\/]+$/, '');
    const out = `${toolchain}-test-output-${process.pid}`;
    assert.ok(!existsSync(out), `${out} is in the way`);
    try {
      const result = build('output-beside', { args: ['--out', out] });
      assert.equal(result.code, 2, result.output);
      assert.ok(
        result.output.includes(
          `The output folder ${out} is outside the toolchain, but its path starts with the toolchain's, ${toolchain}: Astro takes it for a folder inside the toolchain, and the build then cannot find the toolchain's packages. Name a folder whose path does not start with ${toolchain}.`,
        ),
        result.output,
      );
      assert.doesNotMatch(result.output, /Mounted/);
      assert.ok(!existsSync(out), `${out} was written`);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('a library that keeps its content in another folder, in a git repository', () => {
  const library = copyOfFixture('elsewhere');
  renameSync(join(library, 'docs', 'site'), join(library, 'website'));
  const git = (...args) => {
    const date = '2026-01-02T03:04:05Z';
    const result = spawnSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: library,
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      },
    );
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--quiet');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'The fixture');
  const result = build('elsewhere', { library, args: ['--content', 'website'] });

  it('builds from the folder the caller names', () => {
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(
      pages(result.out)
        .map(({ file }) => file)
        .sort(),
      EXPECTED_PAGES,
    );
  });

  it("points edit links at that folder, and dates each page from the library's own history", () => {
    const quickStart = readFileSync(join(result.out, 'quick-start/index.html'), 'utf8');
    assert.match(
      quickStart,
      /href="https:\/\/github\.com\/NCodeGroup\/Fixture\/edit\/main\/website\/quick-start\.mdx"/,
    );
    assert.match(quickStart, /<time datetime="2026-01-02T03:04:05\.000Z">/);
  });
});

describe('a library whose history git cannot read', () => {
  const library = copyOfFixture('unreadable-history');
  // A .git file that points to a folder that is gone. git refuses it, as it refuses a repository
  // another user owns, with the "not a git repository" it also prints for a folder in none.
  writeFileSync(join(library, '.git'), `gitdir: ${join(library, 'gone', '.git')}\n`);
  const result = build('unreadable-history', { library, env: { GITHUB_ACTIONS: 'true' } });
  const warning = /No page shows a "last updated" date: git could not read the history of .+unreadable-history: /;

  it("builds without dates in a repository git refuses, and warns with git's message, as an annotation in GitHub Actions", () => {
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, new RegExp(`^::warning::${warning.source}`, 'm'));
    for (const { file, html } of pages(result.out)) assert.doesNotMatch(html, /<time\b/, `${file} shows a date`);
    const quickStart = readFileSync(join(result.out, 'quick-start/index.html'), 'utf8');
    assert.match(
      quickStart,
      /href="https:\/\/github\.com\/NCodeGroup\/Fixture\/edit\/main\/docs\/site\/quick-start\.mdx"/,
    );
  });

  it('warns, as a plain line outside GitHub Actions, where git is not installed', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const noGit = join(work, 'no-git');
    mkdirSync(noGit, { recursive: true });
    assert.deepEqual(readLastUpdated({ root: library, contentPath: 'docs/site' }, { PATH: noGit }), {});
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], new RegExp(`^${warning.source}spawnSync git ENOENT$`));
  });

  it('says nothing for a folder in no repository, which has no dates by design', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const folder = mkdtempSync(join(tmpdir(), 'ncode-docs-'));
    try {
      assert.deepEqual(readLastUpdated({ root: folder, contentPath: 'docs/site' }), {});
      assert.equal(warn.mock.callCount(), 0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
