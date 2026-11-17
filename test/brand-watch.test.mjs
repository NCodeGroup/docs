// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The brand watch names the newest brand release above the pinned version, and only a published release tagged
// v<x.y.z> counts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newestRelease } from '../scripts/brand-watch.mjs';

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
