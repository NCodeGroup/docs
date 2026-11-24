// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The vendored brand files are the files brand.lock.json pins, and every custom property the theme reads is one the
// brand's stylesheets or the theme define, and none is a step of the brand's colour ramps or type scale.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { definedProperties, PRIMITIVE, readProperties } from '../src/brand/tokens.mjs';
import { root, work } from './helpers.mjs';

const brand = join(root, 'vendor', 'brand');
const check = (lock) =>
  spawnSync(process.execPath, [join(brand, 'vendoring', 'vendor-brand.mjs'), '--check', '--lock', lock], {
    cwd: root,
    encoding: 'utf8',
  });

/** A file of this repository, read as text. */
const read = (path) => readFileSync(join(root, path), 'utf8');

/** The theme's stylesheets, the components and ec.config.mjs: every file that reads the brand's tokens. */
const readers = () => {
  const result = spawnSync('git', ['ls-files', '--', 'src/*.css', 'src/*.astro', 'fixture/*.astro'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const paths = result.stdout.split('\n').filter(Boolean).concat('ec.config.mjs');
  // An empty or partial list would let the scans below pass while they check nothing.
  for (const path of [
    'src/styles/theme.css',
    'src/components/overrides/SiteTitle.astro',
    'fixture/docs/site/_components/ByteGrid.astro',
  ])
    assert.ok(paths.includes(path), `git ls-files lists no ${path}`);
  return paths;
};

/** The custom properties a file reads, with or without a fallback. */
const reads = (path, text) => {
  const names = readProperties(text);
  // ec.config.mjs names a colour token by its role, token('screen'), for var(--nc-color-screen).
  if (path === 'ec.config.mjs')
    names.push(...[...text.matchAll(/token\('([a-z0-9-]+)'\)/g)].map((m) => `--nc-color-${m[1]}`));
  return names;
};

/** Each property a file reads that no stylesheet defines, as `path: name`. */
const undefinedReads = (path, text, known) =>
  reads(path, text)
    .filter((name) => !known.has(name))
    .map((name) => `${path}: ${name}`);

/** Each step of a colour ramp or of the type scale a file reads, as `path: name`. */
const primitiveReads = (path, text) =>
  reads(path, text)
    .filter((name) => PRIMITIVE.test(name))
    .map((name) => `${path}: ${name}`);

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
    appendFileSync(join(copy, 'vendoring', 'vendor-brand.mjs'), '\n// edited\n');
    rmSync(join(copy, 'css', 'fonts.css'));
    const result = check(join(copy, 'brand.lock.json'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tokens\/tokens\.css: differs from tokens\/tokens\.css of brand/);
    assert.match(result.stderr, /vendoring\/vendor-brand\.mjs: differs from vendoring\/vendor-brand\.mjs of brand/);
    assert.match(result.stderr, /css\/fonts\.css: missing/);
  });

  it('defines every custom property the theme, the code blocks and the components read', () => {
    const sources = readers();
    const known = new Set([
      ...definedProperties(read('vendor/brand/tokens/tokens.css')),
      ...definedProperties(read('vendor/brand/css/starlight.css')),
      ...sources.flatMap((path) => definedProperties(read(path))),
    ]);
    assert.deepEqual(
      sources.flatMap((path) => undefinedReads(path, read(path), known)),
      [],
    );
  });

  it("frames a listing on the line height of the brand's code role", () => {
    // tokens.css states a role as a font shorthand: its weight, its size, a slash, its line height, its family.
    const role = /--nc-type-code:[^;]*\/([\d.]+) /.exec(read('vendor/brand/tokens/tokens.css'))?.[1];
    const framed = /codeLineHeight: '([\d.]+)'/.exec(read('ec.config.mjs'))?.[1];
    assert.ok(role, 'tokens.css states the code role with a line height');
    assert.equal(framed, role, "ec.config.mjs frames a listing on the code role's line height");
  });

  it('reads no step of a colour ramp or of the type scale in the theme, the code blocks and the components', () => {
    assert.deepEqual(
      readers().flatMap((path) => primitiveReads(path, read(path))),
      [],
    );
  });

  it('reports a read of an undefined custom property or of a primitive, with or without a fallback', () => {
    const text = '.x { color: var(--nc-blue-600); background: var(--nc-nope, red); }';
    const known = new Set(definedProperties(read('vendor/brand/tokens/tokens.css')));
    assert.deepEqual(undefinedReads('a.css', text, known), ['a.css: --nc-nope']);
    assert.deepEqual(primitiveReads('a.css', text), ['a.css: --nc-blue-600']);
  });
});
