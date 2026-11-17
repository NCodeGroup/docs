// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The vendored brand files are the files brand.lock.json pins, and every custom property the theme reads is one the
// brand's stylesheets or the theme define, and none is a step of the brand's colour ramps or type scale.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { root, work } from './helpers.mjs';

const brand = join(root, 'vendor', 'brand');
const check = (lock) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'vendor-brand.mjs'), '--check', '--lock', lock], {
    cwd: root,
    encoding: 'utf8',
  });

/** The custom properties a stylesheet or a component defines. */
const defined = (text) => [...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]);

/** A file of this repository, read as text. */
const read = (path) => readFileSync(join(root, path), 'utf8');

/** The theme's stylesheets, the components and ec.config.mjs: every file that reads the brand's tokens. */
const readers = () =>
  spawnSync('git', ['ls-files', '--', 'src/*.css', 'src/*.astro', 'fixture/*.astro'], {
    cwd: root,
    encoding: 'utf8',
  })
    .stdout.split('\n')
    .filter(Boolean)
    .concat('ec.config.mjs');

/**
 * The brand's private primitives, which brand's ADR-1002 lets any release change: the steps of its colour ramps and
 * of its type scale.
 */
const PRIMITIVE = /^--nc-(?:(?:blue|stone|green|amber|red)-\d+|(?:text|weight|width|leading|tracking)-[a-z0-9]+)$/;

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

  it('defines every custom property the theme, the code blocks and the components read', () => {
    const sources = readers();
    const known = new Set([
      ...defined(read('vendor/brand/tokens/tokens.css')),
      ...defined(read('vendor/brand/css/starlight.css')),
      ...sources.flatMap((path) => defined(read(path))),
    ]);
    const missing = [];
    for (const path of sources) {
      const text = read(path);
      const names = [...text.matchAll(/var\((--[a-z0-9-]*[a-z0-9])\)/g)].map((match) => match[1]);
      // ec.config.mjs names a colour token by its role, token('screen'), for var(--nc-color-screen).
      if (path === 'ec.config.mjs')
        names.push(...[...text.matchAll(/token\('([a-z0-9-]+)'\)/g)].map((m) => `--nc-color-${m[1]}`));
      for (const name of names) if (!known.has(name)) missing.push(`${path}: ${name}`);
    }
    assert.deepEqual(missing, []);
  });

  it('reads no step of a colour ramp or of the type scale in the theme, the code blocks and the components', () => {
    const primitives = [];
    for (const path of readers()) {
      for (const match of read(path).matchAll(/var\(\s*(--[a-z0-9-]+)/g))
        if (PRIMITIVE.test(match[1])) primitives.push(`${path}: ${match[1]}`);
    }
    assert.deepEqual(primitives, []);
  });
});
