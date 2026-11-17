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
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const REPO = 'NCodeGroup/brand';
export const LOCK = 'vendor/brand/brand.lock.json';
export const LABEL = 'brand-update';
export const MARKER = '<!-- brand-watch -->';
// GitHub's largest page. Releases are listed newest first and the watch keeps one issue open, so one page of each
// holds everything the watch compares.
const PAGE_SIZE = 100;
// A failed or hung request fails the run, and the workflow runs every day, so the next run is the retry.
const REQUEST_TIMEOUT_MS = 30_000;
// The labels the watch's issue gets, created when the repository lacks them, as brand's own pin watch does.
const LABELS = [
  { name: LABEL, color: '1D76DB', description: 'NCodeGroup/brand has a newer release' },
  { name: 'dependencies', color: '0366D6', description: 'A dependency to update' },
];

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
    `To take it, run \`npm run update:brand -- ${v}\`: it writes the release's files, its vendoring script among ` +
    'them, only once `gh attestation verify` proves its archive. Then run `npm run build`, ' +
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

/** A function that sends one request to GitHub's API and resolves with its JSON, or rejects with the answer's status. */
function githubRequest(token, fetch) {
  return async (method, url, body) => {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ncode-docs-brand-watch',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const init = { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
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
}

/** Creates each of `LABELS` the repository lacks. */
async function ensureLabels(request, api) {
  for (const label of LABELS) {
    try {
      await request('GET', `${api}/labels/${encodeURIComponent(label.name)}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      await request('POST', `${api}/labels`, label);
    }
  }
}

/** Compares the lock with brand's newest release and keeps the one issue on GitHub; returns the lines it reports. */
export async function runBrandWatch({ root, repo, token = '', fetch = globalThis.fetch, dryRun = false }) {
  const request = githubRequest(token, fetch);
  const pinned = JSON.parse(readFileSync(path.join(root, LOCK), 'utf8')).version;
  const api = `https://api.github.com/repos/${repo}`;
  const current = `brand ${pinned} is the newest release.`;
  const done =
    `\`${LOCK}\` pins NCode Brand ${pinned}, the newest release, so this issue is done. ` +
    'The brand-watch workflow opens a new one when a newer release is out.';

  const releases = await request('GET', `https://api.github.com/repos/${REPO}/releases?per_page=${PAGE_SIZE}`);
  const release = newestRelease(releases, pinned);
  const issues = await request('GET', `${api}/issues?labels=${LABEL}&state=open&per_page=${PAGE_SIZE}`);
  const text = release ? issueText(pinned, release) : null;
  const action = chooseAction(issues, text);
  const n = action.number;

  switch (action.kind) {
    case 'create': {
      if (dryRun) return [`Would open: ${text.title}`];
      await ensureLabels(request, api);
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

// Only the entry point runs the watch, so the tests can import the functions above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const usage = 'usage: node scripts/brand-watch.mjs [--dry-run] [--repo=<owner/name>]';
  let values;
  try {
    ({ values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, repo: { type: 'string' } } }));
  } catch (error) {
    console.error(`${error.message}\n${usage}`);
    process.exitCode = 2;
  }
  if (values) {
    const dryRun = values['dry-run'];
    const repo = values.repo ?? process.env.GITHUB_REPOSITORY ?? '';
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !(token || dryRun)) {
      console.error(usage);
      process.exitCode = 2;
    } else {
      const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
      try {
        for (const line of await runBrandWatch({ root, repo, token, dryRun })) console.log(line);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    }
  }
}
