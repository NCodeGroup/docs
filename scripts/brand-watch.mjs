// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Compares the brand version that vendor/brand/brand.lock.json pins with the newest release of NCodeGroup/brand, which
// Dependabot can't see, and keeps one open issue labeled brand-update while the lock is behind, closing it once the lock
// pins the newest release.
//
// Usage: node scripts/brand-watch.mjs [--dry-run] [--repo=<owner/name>]
//
// The repository comes from GITHUB_REPOSITORY or --repo, and the token from GITHUB_TOKEN or GH_TOKEN. --dry-run writes
// nothing and needs no token.
//
// Exit codes: 0 done, 1 a request failed, 2 usage error.

export const REPO = 'NCodeGroup/brand';
export const LOCK = 'vendor/brand/brand.lock.json';
export const LABEL = 'brand-update';
export const MARKER = '<!-- brand-watch -->';

/** The [major, minor, patch] numbers of a version shaped <digits>.<digits>.<digits>, or null. */
export function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match ? match.slice(1).map(Number) : null;
}

/** A negative number, 0 or a positive number as the version a is below, equal to or above the version b. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/** The newest release above the pinned version: not a draft or a prerelease, tagged v<x.y.z>; or null. */
export function newestRelease(releases, pinned) {
  if (!parseVersion(pinned)) throw new Error(`can't read the pinned version "${pinned}"`);
  let newest = null;
  for (const r of releases) {
    if (r.draft || r.prerelease || !/^v\d+\.\d+\.\d+$/.test(r.tag_name)) continue;
    const version = r.tag_name.slice(1);
    if (compareVersions(version, pinned) <= 0) continue;
    if (!newest || compareVersions(version, newest.version) > 0) {
      newest = { version, published: new Date(r.published_at) };
    }
  }
  return newest;
}
