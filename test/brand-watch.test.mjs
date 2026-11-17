// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The brand watch names the newest brand release above the pinned version, and only a published release tagged
// v<x.y.z> counts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseAction, issueText, newestRelease } from '../scripts/brand-watch.mjs';

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
    assert.ok(text.body.includes('npm run update:brand -- 0.10.0'));
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

  it('leaves an issue whose body differs only by line endings and trailing spaces', () => {
    const issue = marked(5, { body: `${text.body.replace(/\n/g, '\r\n')}  ` });
    assert.deepEqual(chooseAction([issue], text), { kind: 'none', number: 5 });
  });
});
