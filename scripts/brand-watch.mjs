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

/** The title and body of the issue for a lock that pins `pinned` while `release` is out. */
export function issueText(pinned, release) {
  const brand = `https://github.com/${REPO}`;
  const v = release.version;
  const date = release.published.toISOString().slice(0, 10);
  const intro =
    `${MARKER}\n\`${LOCK}\` pins NCode Brand ${pinned}, and ${v} was published on ${date}: ` +
    `[release notes](${brand}/releases/tag/v${v}), [changes since ${pinned}](${brand}/compare/v${pinned}...v${v}).`;
  const howTo =
    `To take it, run \`npm run update:brand -- ${v}\`: it writes the release's files only once ` +
    '`gh attestation verify` proves its archive. When the release changes `vendoring/vendor-brand.mjs`, copy it over ' +
    '`scripts/vendor-brand.mjs` and run `./.template/Test-FileHeaders.ps1 -Fix`. Then run `npm run build`, ' +
    '`npm run test` and `node scripts/screenshots.mjs`, and name the release in the brand entries of `CHANGELOG.md`.';
  const footer =
    'The brand-watch workflow, `.github/workflows/brand-watch.yml`, checks every day: it rewrites this issue when a ' +
    'newer release is out, and closes it once the lock pins the newest one. A brand release is taken as soon as it ' +
    'is published, as ADR-1008 says.';
  return { title: `Update the brand to ${v}`, body: `${[intro, howTo, footer].join('\n\n')}\n` };
}

/** What to do with the watch's issue: create, edit or close it, or leave it (`none`); `text` is null when current. */
export function chooseAction(issues, text) {
  const issue = issues
    .filter((i) => !i.pull_request && typeof i.body === 'string' && i.body.includes(MARKER))
    .sort((a, b) => a.number - b.number)[0];
  if (!text) return issue ? { kind: 'close', number: issue.number } : { kind: 'none' };
  if (!issue) return { kind: 'create' };
  const normal = (value) =>
    String(value ?? '')
      .replace(/\r\n/g, '\n')
      .trimEnd();
  const same = normal(issue.title) === normal(text.title) && normal(issue.body) === normal(text.body);
  return { kind: same ? 'none' : 'edit', number: issue.number };
}
