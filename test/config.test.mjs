// A library's site.config.json is checked against schema/site.config.schema.json before anything is
// built, and a wrong one is reported by key.
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveLibrary } from '../src/library.mjs';
import { build, copyOfFixture, fixture } from './helpers.mjs';

const CONFIG = 'docs/site/site.config.json';

/** Resolves a copy of the fixture whose configuration `change` has edited. */
function resolveChanged(name, change) {
  const library = copyOfFixture(name);
  const file = join(library, CONFIG);
  const config = JSON.parse(readFileSync(file, 'utf8'));
  change(config);
  writeFileSync(file, JSON.stringify(config, null, 2));
  return () => resolveLibrary({ DOCS_LIBRARY: library });
}

describe('the site configuration', () => {
  it('of the fixture is valid, and its defaults are filled in', () => {
    const library = resolveLibrary({ DOCS_LIBRARY: fixture });
    assert.equal(library.contentPath, 'docs/site');
    assert.equal(library.config.title, 'NCode.Fixture');
    assert.equal(library.config.repository.branch, 'main');
    assert.equal(library.config.editLinks, true);
    assert.deepEqual(
      library.sampleFiles.map((file) => file.slice(fixture.length + 1).replaceAll('\\', '/')),
      ['tests/NCode.Fixture.Tests/ExtensionSamples.cs', 'tests/NCode.Fixture.Tests/QuickStartSamples.cs'],
    );
  });

  it('needs only its required keys', () => {
    const resolve = resolveChanged('config-minimal', (config) => {
      for (const key of ['$schema', 'product', 'mark', 'version', 'social', 'samples']) delete config[key];
      delete config.repository.branch;
    });
    const { config } = resolve();
    assert.equal(config.product, 'NCode.Fixture');
    assert.equal(config.mark, 'ncode');
    assert.deepEqual(config.social, [{ label: 'GitHub', href: 'https://github.com/NCodeGroup/Fixture' }]);
    assert.deepEqual(config.samples, ['tests/**/*.cs']);
  });

  it('rejects an unknown key by name', () => {
    const resolve = resolveChanged('config-unknown', (config) => { config.tittle = 'x'; });
    assert.throws(resolve, /docs\/site\/site\.config\.json is not a valid site configuration:\s+the file has an unknown key "tittle"/);
  });

  it('rejects a missing key, a wrong type and a wrong value, all at once', () => {
    const resolve = resolveChanged('config-wrong', (config) => {
      delete config.title;
      config.editLinks = 'yes';
      config.mark = 'acme';
      config.site.url = 'https://ncodegroup.github.io/Fixture/';
      config.sidebar[0].items.push({ label: 'No target' });
    });
    assert.throws(resolve, (error) => {
      assert.match(error.message, /the file needs "title"/);
      assert.match(error.message, /editLinks must be a boolean, not string/);
      assert.match(error.message, /mark must be one of "ncode", "ncode-identity"/);
      assert.match(error.message, /site\.url \("https:\/\/ncodegroup\.github\.io\/Fixture\/"\) does not have the form its description gives/);
      assert.match(error.message, /sidebar\[0\]\.items\[1\]/);
      return true;
    });
  });

  it('may start with a byte order mark, as a Windows editor writes it', () => {
    const library = copyOfFixture('config-bom');
    const file = join(library, CONFIG);
    writeFileSync(file, '\uFEFF' + readFileSync(file, 'utf8'));
    assert.equal(resolveLibrary({ DOCS_LIBRARY: library }).config.title, 'NCode.Fixture');
  });

  it('explains the form a value must have', () => {
    const resolve = resolveChanged('config-form', (config) => { config.sidebar[0].items[0] = '/quick-start'; config.site.url = 'ncodegroup.github.io/Fixture'; });
    assert.throws(resolve, (error) => {
      assert.match(error.message, /site\.url \("ncodegroup\.github\.io\/Fixture"\) does not have the form its description gives: The site's URL with its base path and no trailing slash/);
      assert.match(error.message, /sidebar\[0\]\.items\[0\]/);
      return true;
    });
  });

  it('must exist in the content folder', () => {
    const library = copyOfFixture('config-absent');
    rmSync(join(library, CONFIG));
    assert.throws(() => resolveLibrary({ DOCS_LIBRARY: library }), /docs\/site\/site\.config\.json was not found/);
  });

  it('is read from the content folder the caller names', () => {
    assert.throws(() => resolveLibrary({ DOCS_LIBRARY: fixture, DOCS_CONTENT: 'website' }), /website\/site\.config\.json was not found/);
    assert.throws(() => resolveLibrary({ DOCS_LIBRARY: fixture, DOCS_CONTENT: '../elsewhere' }), /must be a folder inside the library/);
  });

  it('stops the build with its message, before Astro starts', () => {
    const library = copyOfFixture('config-build');
    writeFileSync(join(library, CONFIG), '{ "title": ');
    const result = build('config-build', { library });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /docs\/site\/site\.config\.json is not valid JSON/);
    assert.doesNotMatch(result.output, /\[build\]/);
  });
});
