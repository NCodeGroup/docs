// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The custom properties a library's own components read: the brand's public tokens pass, and a token the brand does
// not define or a step of a colour ramp or of the type scale stops the build.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { checkComponentTokens } from '../src/brand/tokens.mjs';
import { work } from './helpers.mjs';

/** A library whose content folder holds the given component files, by path under `_components/`. */
const libraryWith = (name, components) => {
  const root = join(work, 'tokens', name);
  rmSync(root, { recursive: true, force: true });
  const contentDirectory = join(root, 'docs', 'site');
  mkdirSync(contentDirectory, { recursive: true });
  for (const [path, text] of Object.entries(components)) {
    const file = join(contentDirectory, '_components', path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
  }
  return { root, contentDirectory, contentPath: 'docs/site' };
};

const primitive = (path, name) =>
  `${path} reads ${name}, a step of the brand's colour ramps or type scale, which a brand release may change; read a colour role or a type role instead.`;
const undefinedToken = (path, name) => `${path} reads ${name}, which the brand does not define.`;

describe("the tokens a library's component reads", () => {
  it('passes a component that reads public tokens, Starlight properties and its own', () => {
    const library = libraryWith('public', {
      'Panel.astro':
        '<style>\n.panel { --nc-local: 1rem; background: var(--nc-color-screen); font-size: var(--sl-text-sm); padding: var(--nc-local); }\n</style>\n',
    });
    assert.doesNotThrow(() => checkComponentTokens(library));
  });

  it('refuses a token the brand does not define', () => {
    const library = libraryWith('undefined', { 'Panel.astro': '<style>.panel { color: var(--nc-nope); }</style>' });
    assert.throws(() => checkComponentTokens(library), {
      message: undefinedToken('docs/site/_components/Panel.astro', '--nc-nope'),
    });
  });

  it('refuses a step of a colour ramp, and a step of the type scale with a fallback', () => {
    const colour = libraryWith('ramp', { 'Panel.astro': '<style>.panel { color: var(--nc-blue-600); }</style>' });
    assert.throws(() => checkComponentTokens(colour), {
      message: primitive('docs/site/_components/Panel.astro', '--nc-blue-600'),
    });
    const scale = libraryWith('scale', {
      'Panel.astro': '<style>.panel { font-size: var(--nc-text-sm, 1rem); }</style>',
    });
    assert.throws(() => checkComponentTokens(scale), {
      message: primitive('docs/site/_components/Panel.astro', '--nc-text-sm'),
    });
  });

  it('reports a name read twice once', () => {
    const library = libraryWith('twice', {
      'Panel.astro': '<style>.a { color: var(--nc-nope); } .b { color: var(--nc-nope, red); }</style>',
    });
    assert.throws(() => checkComponentTokens(library), {
      message: undefinedToken('docs/site/_components/Panel.astro', '--nc-nope'),
    });
  });

  it('checks a .css file', () => {
    const library = libraryWith('css', { 'panel.css': '.panel { color: var(--nc-nope); }' });
    assert.throws(() => checkComponentTokens(library), {
      message: undefinedToken('docs/site/_components/panel.css', '--nc-nope'),
    });
  });

  it('passes a library with no _components folder', () => {
    assert.doesNotThrow(() => checkComponentTokens(libraryWith('none', {})));
  });

  it('lists the problems of several files in path order', () => {
    const library = libraryWith('several', {
      'b/Second.astro': '<style>.x { color: var(--nc-blue-600); }</style>',
      'A.astro': '<style>.x { color: var(--nc-nope); }</style>',
    });
    assert.throws(() => checkComponentTokens(library), {
      message: `The library's components read custom properties the brand does not offer:\n  ${undefinedToken('docs/site/_components/A.astro', '--nc-nope')}\n  ${primitive('docs/site/_components/b/Second.astro', '--nc-blue-600')}`,
    });
  });
});
