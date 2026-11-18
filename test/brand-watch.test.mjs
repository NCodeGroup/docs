// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The brand watch names the newest brand release above the pinned version, and only a published release tagged
// v<x.y.z> counts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { chooseAction, issueText, newestRelease, runBrandWatch } from '../scripts/brand-watch.mjs';
import { root, work } from './helpers.mjs';

const release = (tag_name, extra = {}) => ({
  tag_name,
  draft: false,
  prerelease: false,
  published_at: '2026-11-20T10:00:00Z',
  ...extra,
});

describe('newestRelease', () => {
  const releases = [
    release('v0.9.1', { published_at: '2026-11-01T10:00:00Z' }),
    release('v0.10.0', { published_at: '2026-11-20T10:00:00Z' }),
    release('v0.12.0', { draft: true }),
    release('v0.13.0', { prerelease: true }),
    release('0.11.0'),
    release('v1.0.0-rc.1'),
    release('v0.8.0'),
  ];

  it('names the highest published release above the pinned version', () => {
    const newest = newestRelease(releases, '0.9.0');
    assert.equal(newest.version, '0.10.0');
    assert.equal(newest.published.toISOString(), '2026-11-20T10:00:00.000Z');
  });

  it('returns null when the pinned version is the newest', () => {
    assert.equal(newestRelease(releases, '0.10.0'), null);
  });

  it("throws when it can't read the pinned version", () => {
    assert.throws(() => newestRelease(releases, 'v0.9.0'), /can't read the pinned version "v0.9.0"/);
  });
});

describe('issueText', () => {
  const text = issueText('0.9.0', { version: '0.10.0', published: new Date('2026-11-20T10:00:00Z') });

  it('titles the issue with the release', () => {
    assert.equal(text.title, 'Update the brand to 0.10.0');
  });

  it('starts with the marker and links the release, the changes and the command', () => {
    assert.ok(text.body.startsWith('<!-- brand-watch -->\n'));
    assert.ok(text.body.includes('2026-11-20'));
    assert.ok(text.body.includes('https://github.com/NCodeGroup/brand/releases/tag/v0.10.0'));
    assert.ok(text.body.includes('https://github.com/NCodeGroup/brand/compare/v0.9.0...v0.10.0'));
    assert.ok(text.body.includes("npm run update:brand '--' 0.10.0"));
  });

  it('ends with one newline after the last sentence', () => {
    assert.ok(text.body.endsWith('.\n'));
  });
});

describe('chooseAction', () => {
  const text = { title: 'Update the brand to 0.10.0', body: '<!-- brand-watch -->\nBody.\n' };
  const marked = (number, extra = {}) => ({ number, title: text.title, body: text.body, ...extra });

  it('closes the marked issue when the lock is current', () => {
    assert.deepEqual(chooseAction([marked(5)], null), { kind: 'close', number: 5 });
  });

  it('does nothing when the lock is current and no issue is open', () => {
    assert.deepEqual(chooseAction([], null), { kind: 'none' });
  });

  it('creates the issue when only a pull request or an unmarked issue is open', () => {
    const issues = [marked(3, { pull_request: {} }), { number: 4, title: 'Other', body: 'No marker.' }];
    assert.deepEqual(chooseAction(issues, text), { kind: 'create' });
  });

  it('edits the lowest-numbered marked issue when its text differs', () => {
    const issues = [
      marked(7, { title: 'Update the brand to 0.9.1' }),
      marked(5, { title: 'Update the brand to 0.9.1' }),
    ];
    assert.deepEqual(chooseAction(issues, text), { kind: 'edit', number: 5 });
  });

  it('edits the issue when only its body differs', () => {
    const issue = marked(5, { body: '<!-- brand-watch -->\nAn older body.\n' });
    assert.deepEqual(chooseAction([issue], text), { kind: 'edit', number: 5 });
  });

  it('leaves an issue whose body differs only by line endings and trailing spaces', () => {
    const issue = marked(5, { body: `${text.body.replace(/\n/g, '\r\n')}  ` });
    assert.deepEqual(chooseAction([issue], text), { kind: 'none', number: 5 });
  });
});

describe('runBrandWatch', () => {
  const watchRoot = join(work, 'brand-watch');
  mkdirSync(join(watchRoot, 'vendor', 'brand'), { recursive: true });
  writeFileSync(join(watchRoot, 'vendor', 'brand', 'brand.lock.json'), JSON.stringify({ version: '0.9.0', files: {} }));

  const newer = [release('v0.10.0')];
  const text = issueText('0.9.0', { version: '0.10.0', published: new Date('2026-11-20T10:00:00Z') });
  const open = (number, extra = {}) => ({ number, title: text.title, body: text.body, ...extra });

  // Runs the watch against a fake GitHub: `answer(method, url)` gives { status, json } or just the json of a 200.
  const run = async (answer, options = {}) => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({
        method: init.method,
        url,
        body: init.body && JSON.parse(init.body),
        auth: init.headers.Authorization,
      });
      const result = answer(init.method, url);
      const { status = 200, json = result } = result && 'json' in result ? result : { json: result };
      return new Response(JSON.stringify(json), { status });
    };
    try {
      const lines = await runBrandWatch({ root: watchRoot, repo: 'NCodeGroup/docs', fetch, ...options });
      return { calls, lines };
    } catch (error) {
      error.calls = calls;
      throw error;
    }
  };
  const base =
    (releases, issues, rest = () => ({})) =>
    (method, url) => {
      if (url.includes('/NCodeGroup/brand/releases')) return releases;
      if (url.includes('/issues?')) return issues;
      return rest(method, url);
    };

  it('opens the issue and creates the missing labels', async () => {
    const { calls, lines } = await run(
      base(newer, [], (method, url) => {
        if (method === 'GET' && url.endsWith('/labels/brand-update')) return { status: 404, json: {} };
        if (method === 'POST' && url.endsWith('/issues')) return { json: { number: 12 } };
        return {};
      }),
      { token: 't' },
    );
    assert.deepEqual(lines, ['Opened #12: Update the brand to 0.10.0']);
    const posts = calls.filter((c) => c.method === 'POST');
    assert.equal(posts.length, 2);
    assert.equal(posts[0].url, 'https://api.github.com/repos/NCodeGroup/docs/labels');
    assert.equal(posts[0].body.name, 'brand-update');
    assert.equal(posts[1].url, 'https://api.github.com/repos/NCodeGroup/docs/issues');
    assert.deepEqual(posts[1].body.labels, ['brand-update', 'dependencies']);
    assert.equal(posts[1].body.title, text.title);
    assert.equal(posts[1].auth, 'Bearer t');
  });

  it('updates an issue that names an older release', async () => {
    const { calls, lines } = await run(base(newer, [open(5, { title: 'Update the brand to 0.9.1' })]), { token: 't' });
    assert.deepEqual(lines, ['Updated #5: Update the brand to 0.10.0']);
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.equal(patch.url, 'https://api.github.com/repos/NCodeGroup/docs/issues/5');
    assert.deepEqual(patch.body, { title: text.title, body: text.body });
  });

  it('closes the issue when the lock pins the newest release', async () => {
    const { calls, lines } = await run(base([release('v0.9.0')], [open(5)]), { token: 't' });
    assert.deepEqual(lines, ['Closed #5: brand 0.9.0 is the newest release.']);
    const writes = calls.filter((c) => c.method !== 'GET');
    assert.deepEqual(
      writes.map((c) => c.method),
      ['POST', 'PATCH'],
    );
    assert.equal(writes[0].url, 'https://api.github.com/repos/NCodeGroup/docs/issues/5/comments');
    assert.deepEqual(writes[1].body, { state: 'closed', state_reason: 'completed' });
  });

  it('does nothing when the open issue already says it', async () => {
    const { calls, lines } = await run(base(newer, [open(5)]), { token: 't' });
    assert.deepEqual(lines, ['#5 already says: Update the brand to 0.10.0']);
    assert.ok(calls.every((c) => c.method === 'GET'));
  });

  it('does nothing when the lock is current and no issue is open', async () => {
    const { calls, lines } = await run(base([release('v0.9.0')], []), { token: 't' });
    assert.deepEqual(lines, ['brand 0.9.0 is the newest release.']);
    assert.ok(calls.every((c) => c.method === 'GET'));
  });

  it('writes nothing in a dry run, which needs no token', async () => {
    const { calls, lines } = await run(base(newer, []), { dryRun: true });
    assert.deepEqual(lines, ['Would open: Update the brand to 0.10.0']);
    assert.ok(calls.every((c) => c.method === 'GET' && c.auth === undefined));
  });

  it('says what a dry run would update and close', async () => {
    const update = await run(base(newer, [open(5, { title: 'Other' })]), { dryRun: true });
    assert.deepEqual(update.lines, ['Would update #5: Update the brand to 0.10.0']);
    const close = await run(base([release('v0.9.0')], [open(5)]), { dryRun: true });
    assert.deepEqual(close.lines, ['Would close #5: brand 0.9.0 is the newest release.']);
    assert.ok([...update.calls, ...close.calls].every((c) => c.method === 'GET'));
  });

  it('rejects when the releases request fails', async () => {
    await assert.rejects(
      run(() => ({ status: 500, json: {} })),
      /answered 500/,
    );
  });

  it('rejects, posting nothing, when a label request is refused', async () => {
    const answer = base(newer, [], (_method, url) => (url.includes('/labels/') ? { status: 403, json: {} } : {}));
    await assert.rejects(run(answer, { token: 't' }), (error) => {
      assert.match(error.message, /answered 403/);
      assert.ok(error.calls.every((c) => c.method === 'GET'));
      return true;
    });
  });
});

describe('the command line', () => {
  const { GITHUB_TOKEN, GH_TOKEN, GITHUB_REPOSITORY, ...env } = process.env;
  const run = (...args) =>
    spawnSync(process.execPath, [join(root, 'scripts', 'brand-watch.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8',
      env,
    });

  it('exits 2 with the usage when a real run has no token', () => {
    const result = run('--repo=NCodeGroup/docs');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage: node scripts\/brand-watch\.mjs/);
  });

  it('exits 2 when the repository is not owner/name', () => {
    assert.equal(run('--repo=not-a-repo', '--dry-run').status, 2);
  });

  it('exits 2 for an option it does not know', () => {
    const result = run('--bogus');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage: node scripts\/brand-watch\.mjs/);
  });

  it('exits 1 with the error when the run fails', () => {
    const cli = join(work, 'brand-watch-cli');
    rmSync(cli, { recursive: true, force: true });
    mkdirSync(join(cli, 'scripts'), { recursive: true });
    // The copy has no vendor/brand/brand.lock.json beside it, so the run fails before any request.
    copyFileSync(join(root, 'scripts', 'brand-watch.mjs'), join(cli, 'scripts', 'brand-watch.mjs'));
    const result = spawnSync(
      process.execPath,
      [join(cli, 'scripts', 'brand-watch.mjs'), '--dry-run', '--repo=NCodeGroup/docs'],
      { cwd: cli, encoding: 'utf8', env },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /brand\.lock\.json/);
  });
});
