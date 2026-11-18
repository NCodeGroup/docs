// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { root } from './helpers.mjs';

// PowerShell drops a bare `--` before npm's `npm.ps1` shim runs, so npm reads the script's arguments as its own. The
// documented commands write the separator quoted, '--'. Template-owned files are skipped because template updates
// replace them.
const SKIPPED = [
  'vendor/',
  '.template/',
  '.github/skills/',
  '.github/prompts/',
  '.github/agents/',
  '.github/instructions/project-template.instructions.md',
  '.claude/',
  'docs/decisions/project-template/',
  'docs/best-practices-criteria.md',
  'CLAUDE.md',
];
const BARE_SEPARATOR = /\bnpm (?:--prefix \S+ )?run [\w:-]+ --(?=\s|$)/;
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((file) => /\.(md|mdx|mjs|astro|ya?ml)$/.test(file) && !SKIPPED.some((path) => file.startsWith(path)));

describe('the documented npm commands', () => {
  it("quote the separator as '--', so PowerShell passes it to npm", () => {
    const bare = [];
    for (const file of files) {
      for (const [index, line] of readFileSync(join(root, file), 'utf8').split(/\r?\n/).entries()) {
        if (BARE_SEPARATOR.test(line)) {
          bare.push(`${file}:${index + 1}`);
        }
      }
    }
    assert.deepEqual(
      bare,
      [],
      `A documented npm command writes a bare --, which PowerShell drops; write '--' in:\n${bare.join('\n')}`,
    );
  });

  it('find a bare separator and pass a quoted one', () => {
    // The bare forms are built from BARE so this file's own lines never match the scan.
    const BARE = '--';
    for (const line of [
      `npm run dev ${BARE} ../Buffers`,
      `npm --prefix ../docs run site ${BARE} build .`,
      `npm run browser ${BARE}`,
    ]) {
      assert.ok(BARE_SEPARATOR.test(line), line);
    }
    for (const line of [
      "npm run dev '--' ../Buffers",
      "npm --prefix ../docs run site '--' build .",
      'npm ci --ignore-scripts',
      'npm run build',
    ]) {
      assert.ok(!BARE_SEPARATOR.test(line), line);
    }
  });

  it('scan the documents that hold the commands', () => {
    for (const file of [
      'README.md',
      'AGENTS.md',
      'CONTRIBUTING.md',
      'CHANGELOG.md',
      '.github/workflows/ci.yml',
      'src/library.mjs',
    ]) {
      assert.ok(files.includes(file), file);
    }
  });
});
