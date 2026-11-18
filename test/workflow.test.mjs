// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { root } from './helpers.mjs';

// R1 to R3 of docs/assurance-case.md rest on these two files as written. The workflow runs in other repositories,
// where nothing else would notice a weakened permission, pin or install, so the tests read both as text.
const workflow = readFileSync(join(root, '.github/workflows/site.yml'), 'utf8');
const npmrc = readFileSync(join(root, '.npmrc'), 'utf8');

// The workflow is read as text, without a YAML package (ADR-1000), so a job is the lines from its key to the next
// key at its indent or less; comment lines are dropped so a comment can't satisfy or break an assertion.
function job(name) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `.github/workflows/site.yml has no job ${name}`);
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  return lines
    .slice(start, end < 0 ? undefined : end)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('the site workflow and the npm settings', () => {
  it('give the build job no write permission and keep no credentials (R1)', () => {
    assert.match(workflow, /^permissions: \{\}$/m);
    const build = job('build');
    assert.match(build, /^ {6}contents: read$/m);
    assert.match(build, /^ {6}pages: read$/m);
    assert.doesNotMatch(build, /: write$/m);
    const checkouts = build.match(/uses: actions\/checkout@/g) ?? [];
    assert.ok(checkouts.length > 0, 'the build job checks out nothing');
    assert.equal((build.match(/^ +persist-credentials: false$/gm) ?? []).length, checkouts.length);
  });

  it('give the deploy job only the Pages and OIDC write permissions it needs (R2)', () => {
    const deploy = job('deploy');
    const writes = (deploy.match(/^[ \t]+[\w-]+: write(-all)?$/gm) ?? []).map((line) => line.trim()).sort();
    assert.deepEqual(writes, ['id-token: write', 'pages: write']);
  });

  it('deploy only from the default branch, running nothing of the library or the toolchain (R2)', () => {
    const deploy = job('deploy');
    assert.match(
      deploy,
      /^ {4}if: inputs\.deploy && github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)$/m,
    );
    assert.match(deploy, /^ {6}name: github-pages$/m);
    assert.doesNotMatch(deploy, /actions\/checkout@|^[ \t]*(- )?run:/m);
  });

  it('check the toolchain out at the pinned commit, and stop a run that knows no commit (R3)', () => {
    const build = job('build');
    assert.match(build, /^ {10}ref: \$\{\{ inputs\.toolchain-ref \|\| job\.workflow_sha \}\}$/m);
    assert.match(build, /^ {8}if: inputs\.toolchain-ref == '' && !job\.workflow_sha$/m);
    assert.match(build, /^ {10}exit 1$/m);
  });

  it('pin every action by commit and install the locked packages without scripts or a cache (R3)', () => {
    const uses = [...workflow.matchAll(/^[ \t]*(?:- )?uses: (\S+)/gm)].map((match) => match[1]);
    assert.ok(uses.length > 0, '.github/workflows/site.yml uses no action');
    assert.deepEqual(
      uses.filter((use) => !/@[0-9a-f]{40}$/.test(use)),
      [],
    );
    assert.match(workflow, /^cache-mode: none$/m);
    assert.match(workflow, /^ +package-manager-cache: false$/m);
    assert.match(workflow, /^ +run: npm ci --ignore-scripts --omit=dev$/m);
    assert.doesNotMatch(workflow, /actions\/cache@/);
  });

  it("check the layout of the built site in the runner's browser, after the upload", () => {
    const build = job('build');
    const upload = build.indexOf('actions/upload-pages-artifact@');
    assert.ok(upload >= 0, 'the build job does not upload the site');
    assert.ok(build.search(/^ +run: node scripts\/site\.mjs check$/m) > upload);
    assert.doesNotMatch(build, /playwright|npx /);
  });

  it('take only releases at least three days old, with an npm that honours it (R3)', () => {
    assert.match(npmrc, /^min-release-age=3$/m);
    assert.match(npmrc, /^engine-strict=true$/m);
  });
});
