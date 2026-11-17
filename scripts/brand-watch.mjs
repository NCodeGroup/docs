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

import { readFileSync } from 'node:fs';
import path from 'node:path';

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

/** Compares the lock with brand's newest release and keeps the one issue on GitHub; returns the lines it reports. */
export async function runBrandWatch({ root, repo, token = '', fetch = globalThis.fetch, dryRun = false }) {
  const pinned = JSON.parse(readFileSync(path.join(root, LOCK), 'utf8')).version;
  const api = `https://api.github.com/repos/${repo}`;
  const current = `brand ${pinned} is the newest release.`;
  const done =
    `\`${LOCK}\` pins NCode Brand ${pinned}, the newest release, so this issue is done. ` +
    'The brand-watch workflow opens a new one when a newer release is out.';
  const LABELS = [
    { name: LABEL, color: '1D76DB', description: 'NCodeGroup/brand has a newer release' },
    { name: 'dependencies', color: '0366D6', description: 'A dependency to update' },
  ];

  const request = async (method, url, body) => {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ncode-docs-brand-watch',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const init = { method, headers, signal: AbortSignal.timeout(30_000) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    if (!response.ok) {
      const error = new Error(`${method} ${url} answered ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  const releases = await request('GET', `https://api.github.com/repos/${REPO}/releases?per_page=100`);
  const release = newestRelease(releases, pinned);
  const issues = await request('GET', `${api}/issues?labels=${LABEL}&state=open&per_page=100`);
  const text = release ? issueText(pinned, release) : null;
  const action = chooseAction(issues, text);
  const n = action.number;

  switch (action.kind) {
    case 'create': {
      if (dryRun) return [`Would open: ${text.title}`];
      for (const label of LABELS) {
        try {
          await request('GET', `${api}/labels/${encodeURIComponent(label.name)}`);
        } catch (error) {
          if (error.status !== 404) throw error;
          await request('POST', `${api}/labels`, label);
        }
      }
      const created = await request('POST', `${api}/issues`, {
        title: text.title,
        body: text.body,
        labels: LABELS.map((l) => l.name),
      });
      return [`Opened #${created.number}: ${text.title}`];
    }
    case 'edit':
      if (dryRun) return [`Would update #${n}: ${text.title}`];
      await request('PATCH', `${api}/issues/${n}`, { title: text.title, body: text.body });
      return [`Updated #${n}: ${text.title}`];
    case 'close':
      if (dryRun) return [`Would close #${n}: ${current}`];
      await request('POST', `${api}/issues/${n}/comments`, { body: done });
      await request('PATCH', `${api}/issues/${n}`, { state: 'closed', state_reason: 'completed' });
      return [`Closed #${n}: ${current}`];
    default:
      return [n ? `#${n} already says: ${text.title}` : current];
  }
}
