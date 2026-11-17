// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The vendored brand files are the files brand.lock.json pins.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { root, work } from './helpers.mjs';

const brand = join(root, 'vendor', 'brand');
const check = (lock) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'vendor-brand.mjs'), '--check', '--lock', lock], {
    cwd: root,
    encoding: 'utf8',
  });

describe('the vendored brand', () => {
  it('matches its lock', () => {
    const result = check(join(brand, 'brand.lock.json'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /vendored files match the lock\./);
  });

  it('fails the check when a vendored file was edited or removed', () => {
    const copy = join(work, 'vendor-brand-copy');
    rmSync(copy, { recursive: true, force: true });
    cpSync(brand, copy, { recursive: true });

    appendFileSync(join(copy, 'tokens', 'tokens.css'), '\n:root { --nc-brand: red; }\n');
    rmSync(join(copy, 'css', 'fonts.css'));
    const result = check(join(copy, 'brand.lock.json'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tokens\/tokens\.css: differs from tokens\/tokens\.css of brand/);
    assert.match(result.stderr, /css\/fonts\.css: missing/);
  });
});
