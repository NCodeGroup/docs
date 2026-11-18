// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// A library's site.config.json is checked against schema/site.config.schema.json before anything is
// built, and a wrong one is reported by key.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveLibrary } from '../src/library.mjs';
import { build, copyOfFixture, fixture, withLinks, work } from './helpers.mjs';

const CONFIG = 'docs/site/site.config.json';

/** A copy of the fixture whose configuration `change` has edited. */
function changedCopy(name, change) {
  const library = copyOfFixture(name);
  const file = join(library, CONFIG);
  const config = JSON.parse(readFileSync(file, 'utf8'));
  change(config);
  writeFileSync(file, JSON.stringify(config, null, 2));
  return library;
}

/** Resolves a copy of the fixture whose configuration `change` has edited. */
function resolveChanged(name, change) {
  const library = changedCopy(name, change);
  return () => resolveLibrary({ DOCS_LIBRARY: library });
}

/** A sample file's path relative to the library, with forward slashes. */
const relativeTo = (library) => (file) => file.slice(library.length + 1).replaceAll('\\', '/');

/** A folder beside the copies of the fixture, so outside each of them, with a marked region in it. */
function outsideFolder(name) {
  const folder = join(work, 'libraries', name);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'Outside.cs'), '// begin-snippet: Outside\nvar outside = 1;\n// end-snippet\n');
  return folder;
}

/** The message for a file a glob matches that a symbolic link puts outside the library. */
const linkedOutside = (glob, file, realPath) =>
  `${CONFIG}: the samples glob "${glob}" matches ${file}, which is outside the library through a symbolic link: its real path is ${realPath}. A sample file is under the repository root once every link on its path is followed.`;

describe('the site configuration', () => {
  it('of the fixture is valid, and its defaults are filled in', () => {
    const library = resolveLibrary({ DOCS_LIBRARY: fixture });
    assert.equal(library.contentPath, 'docs/site');
    assert.equal(library.config.title, 'NCode.Fixture');
    assert.equal(library.config.repository.branch, 'main');
    assert.equal(library.config.editLinks, true);
    assert.deepEqual(library.config.requiredHeadings, [
      { pages: ['guides/derive-*', 'guides/ban-*'], headings: ['## Checklist'] },
    ]);
    assert.deepEqual(library.sampleFiles.map(relativeTo(fixture)), [
      'tests/NCode.Fixture.Tests/ExtensionSamples.cs',
      'tests/NCode.Fixture.Tests/QuickStartSamples.cs',
    ]);
  });

  it('needs only its required keys', () => {
    const resolve = resolveChanged('config-minimal', (config) => {
      for (const key of ['$schema', 'product', 'mark', 'version', 'social', 'samples', 'requiredHeadings'])
        delete config[key];
      delete config.repository.branch;
    });
    const { config } = resolve();
    assert.equal(config.product, 'NCode.Fixture');
    assert.equal(config.mark, 'ncode');
    assert.deepEqual(config.social, [{ label: 'GitHub', href: 'https://github.com/NCodeGroup/Fixture' }]);
    assert.deepEqual(config.samples, ['tests/**/*.cs']);
    assert.deepEqual(config.requiredHeadings, []);
  });

  it('rejects an unknown key by name', () => {
    const resolve = resolveChanged('config-unknown', (config) => {
      config.tittle = 'x';
    });
    assert.throws(
      resolve,
      /docs\/site\/site\.config\.json is not a valid site configuration:\s+the file has an unknown key "tittle"/,
    );
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
      assert.match(
        error.message,
        /site\.url \("https:\/\/ncodegroup\.github\.io\/Fixture\/"\) does not have the form its description gives/,
      );
      assert.match(error.message, /sidebar\[0\]\.items\[1\]/);
      return true;
    });
  });

  it('rejects a required-headings rule of the wrong form, by name', () => {
    const resolve = resolveChanged('config-headings', (config) => {
      config.requiredHeadings = [{ pages: [], headings: ['Checklist'], exempt: [] }];
    });
    assert.throws(resolve, (error) => {
      assert.ok(error.message.includes('requiredHeadings[0].pages must have at least 1 entry'), error.message);
      assert.ok(
        error.message.includes(
          'requiredHeadings[0].headings[0] ("Checklist") does not have the form its description gives: A heading as written in Markdown: ## to ######, a space and the text a reader sees, such as ## Checklist.',
        ),
        error.message,
      );
      assert.ok(
        error.message.includes('requiredHeadings[0] has an unknown key "exempt" (known: pages, headings, except)'),
        error.message,
      );
      return true;
    });
  });

  it('may start with a byte order mark, as a Windows editor writes it', () => {
    const library = copyOfFixture('config-bom');
    const file = join(library, CONFIG);
    writeFileSync(file, `\uFEFF${readFileSync(file, 'utf8')}`);
    assert.equal(resolveLibrary({ DOCS_LIBRARY: library }).config.title, 'NCode.Fixture');
  });

  it('explains the form a value must have', () => {
    const resolve = resolveChanged('config-form', (config) => {
      config.sidebar[0].items[0] = '/quick-start';
      config.site.url = 'ncodegroup.github.io/Fixture';
    });
    assert.throws(resolve, (error) => {
      assert.match(
        error.message,
        /site\.url \("ncodegroup\.github\.io\/Fixture"\) does not have the form its description gives: The site's URL with its base path and no trailing slash/,
      );
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
    assert.throws(
      () => resolveLibrary({ DOCS_LIBRARY: fixture, DOCS_CONTENT: 'website' }),
      /website\/site\.config\.json was not found/,
    );
    assert.throws(
      () => resolveLibrary({ DOCS_LIBRARY: fixture, DOCS_CONTENT: '../elsewhere' }),
      /must be a folder inside the library/,
    );
  });

  it('stops at a samples glob that matches a file outside the library, however the glob gets there', () => {
    // A folder beside the copy, with a marked region in it.
    const outside = join(work, 'libraries', 'config-outside-files');
    rmSync(outside, { recursive: true, force: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'Secret.cs'), '// begin-snippet: Secret\nvar secret = 1;\n// end-snippet\n');
    for (const glob of [
      'tests/../../config-outside-files/*.cs',
      '[.][.]/config-outside-files/*.cs',
      '{..,tests}/config-outside-files/*.cs',
    ]) {
      const resolve = resolveChanged('config-outside', (config) => {
        config.samples = ['tests/**/*.cs', glob];
      });
      assert.throws(resolve, (error) => {
        assert.equal(
          error.message,
          `${CONFIG}: the samples glob "${glob}" matches ../config-outside-files/Secret.cs, which is outside the library. A glob names files under the repository root, such as tests/**/*.cs.`,
        );
        return true;
      });
    }
  });

  it('never reads from bin and obj, even where a glob names the folder', () => {
    const library = changedCopy('config-build-output', (config) => {
      config.samples = ['tests/**/*.cs', 'tests/NCode.Fixture.Tests/bin/**/*.cs', 'tests/NCode.Fixture.Tests/obj/*.cs'];
    });
    for (const folder of ['bin/Debug', 'obj']) {
      const copies = join(library, 'tests', 'NCode.Fixture.Tests', ...folder.split('/'));
      mkdirSync(copies, { recursive: true });
      writeFileSync(join(copies, 'Copy.cs'), '// begin-snippet: Copy\nvar copy = 1;\n// end-snippet\n');
    }
    assert.deepEqual(resolveLibrary({ DOCS_LIBRARY: library }).sampleFiles.map(relativeTo(library)), [
      'tests/NCode.Fixture.Tests/ExtensionSamples.cs',
      'tests/NCode.Fixture.Tests/QuickStartSamples.cs',
    ]);
  });

  // Each link's target is relative to the link's folder, as git checks out a committed link.
  it('stops at a sample file that is a symbolic link to a file outside the library', withLinks, () => {
    const outside = outsideFolder('config-link-file-outside');
    const library = copyOfFixture('config-link-file');
    symlinkSync(
      '../../../config-link-file-outside/Outside.cs',
      join(library, 'tests', 'NCode.Fixture.Tests', 'Outside.cs'),
    );
    assert.throws(() => resolveLibrary({ DOCS_LIBRARY: library }), {
      message: linkedOutside(
        'tests/**/*.cs',
        'tests/NCode.Fixture.Tests/Outside.cs',
        realpathSync(join(outside, 'Outside.cs')),
      ),
    });
  });

  it('stops at a chain of symbolic links whose first link stays inside the library', withLinks, () => {
    const outside = outsideFolder('config-link-chain-outside');
    const library = copyOfFixture('config-link-chain');
    // Chain.cs leads to hop/Hop.cs, inside the library and matched by no glob, and that link leads out.
    mkdirSync(join(library, 'hop'));
    symlinkSync('../../hop/Hop.cs', join(library, 'tests', 'NCode.Fixture.Tests', 'Chain.cs'));
    symlinkSync('../../config-link-chain-outside/Outside.cs', join(library, 'hop', 'Hop.cs'));
    assert.throws(() => resolveLibrary({ DOCS_LIBRARY: library }), {
      message: linkedOutside(
        'tests/**/*.cs',
        'tests/NCode.Fixture.Tests/Chain.cs',
        realpathSync(join(outside, 'Outside.cs')),
      ),
    });
  });

  it('stops at a folder a glob names that is a symbolic link out of the library', withLinks, () => {
    const outside = outsideFolder('config-link-folder-outside');
    const library = changedCopy('config-link-folder', (config) => {
      config.samples = ['tests/link/*.cs'];
    });
    symlinkSync('../../config-link-folder-outside', join(library, 'tests', 'link'));
    assert.throws(() => resolveLibrary({ DOCS_LIBRARY: library }), {
      message: linkedOutside('tests/link/*.cs', 'tests/link/Outside.cs', realpathSync(join(outside, 'Outside.cs'))),
    });
  });

  it(
    'stops at a sample file whose symbolic link leads nowhere or around in a loop, naming the glob and the file',
    withLinks,
    () => {
      for (const [name, target, code] of [
        ['Dangling.cs', 'Missing.cs', 'ENOENT'],
        ['Loop.cs', 'Loop.cs', 'ELOOP'],
      ]) {
        const library = copyOfFixture(`config-link-${code.toLowerCase()}`);
        symlinkSync(target, join(library, 'tests', 'NCode.Fixture.Tests', name));
        assert.throws(
          () => resolveLibrary({ DOCS_LIBRARY: library }),
          (error) => {
            assert.equal(error.cause?.code, code);
            assert.equal(
              error.message,
              `${CONFIG}: the samples glob "tests/**/*.cs" matches tests/NCode.Fixture.Tests/${name}, which could not be read: ${error.cause.message}`,
            );
            return true;
          },
        );
      }
    },
  );

  it(
    'follows a symbolic link that stays inside the library, and names the file as the glob matched it',
    withLinks,
    () => {
      const library = copyOfFixture('config-link-inside');
      const shared = join(library, 'shared');
      mkdirSync(join(shared, 'more'), { recursive: true });
      writeFileSync(join(shared, 'Linked.cs'), '// begin-snippet: Linked\nvar linked = 1;\n// end-snippet\n');
      writeFileSync(join(shared, 'more', 'More.cs'), '// begin-snippet: More\nvar more = 1;\n// end-snippet\n');
      symlinkSync('../../shared/Linked.cs', join(library, 'tests', 'NCode.Fixture.Tests', 'Linked.cs'));
      symlinkSync('../shared/more', join(library, 'tests', 'more'));
      const sampleFiles = (samples) => {
        const file = join(library, CONFIG);
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), samples }, null, 2));
        return resolveLibrary({ DOCS_LIBRARY: library }).sampleFiles.map(relativeTo(library));
      };
      const projectFiles = [
        'tests/NCode.Fixture.Tests/ExtensionSamples.cs',
        'tests/NCode.Fixture.Tests/Linked.cs',
        'tests/NCode.Fixture.Tests/QuickStartSamples.cs',
      ];
      // * and ** never descend into a folder that is a symbolic link: a glob reaches it only by writing out its path.
      assert.deepEqual(sampleFiles(['tests/**/*.cs', 'tests/*/*.cs', 'tests/m*/*.cs']), projectFiles);
      assert.deepEqual(sampleFiles(['tests/**/*.cs', 'tests/more/*.cs']), [...projectFiles, 'tests/more/More.cs']);
    },
  );

  it(
    'never follows a symbolic link in a folder that is never read, even one that leads outside the library or nowhere',
    withLinks,
    () => {
      outsideFolder('config-link-in-obj-outside');
      const library = changedCopy('config-link-in-obj', (config) => {
        config.samples = ['tests/**/*.cs', 'tests/NCode.Fixture.Tests/obj/*.cs'];
      });
      const obj = join(library, 'tests', 'NCode.Fixture.Tests', 'obj');
      mkdirSync(obj, { recursive: true });
      symlinkSync('../../../../config-link-in-obj-outside/Outside.cs', join(obj, 'Outside.cs'));
      symlinkSync('Missing.cs', join(obj, 'Dangling.cs'));
      assert.deepEqual(resolveLibrary({ DOCS_LIBRARY: library }).sampleFiles.map(relativeTo(library)), [
        'tests/NCode.Fixture.Tests/ExtensionSamples.cs',
        'tests/NCode.Fixture.Tests/QuickStartSamples.cs',
      ]);
    },
  );

  it('never reads from bin and obj through a symbolic link', withLinks, () => {
    const library = changedCopy('config-link-build-output', (config) => {
      config.samples = ['tests/**/*.cs', 'tests/output/*.cs'];
    });
    const project = join(library, 'tests', 'NCode.Fixture.Tests');
    for (const folder of ['bin/Debug', 'obj']) {
      const copies = join(project, ...folder.split('/'));
      mkdirSync(copies, { recursive: true });
      writeFileSync(join(copies, 'Copy.cs'), '// begin-snippet: Copy\nvar copy = 1;\n// end-snippet\n');
    }
    symlinkSync('obj/Copy.cs', join(project, 'Generated.cs'));
    symlinkSync('NCode.Fixture.Tests/bin/Debug', join(library, 'tests', 'output'));
    assert.deepEqual(resolveLibrary({ DOCS_LIBRARY: library }).sampleFiles.map(relativeTo(library)), [
      'tests/NCode.Fixture.Tests/ExtensionSamples.cs',
      'tests/NCode.Fixture.Tests/QuickStartSamples.cs',
    ]);
  });

  it(
    'is read from a library reached through a symbolic link, such as a checkout under a linked folder',
    withLinks,
    () => {
      copyOfFixture('config-linked-root');
      // The folder that holds the copy, reached through a link, and the copy itself, through another.
      const linkedFolder = join(work, 'linked-libraries');
      const linkedCopy = join(work, 'libraries', 'config-linked-root-link');
      for (const [target, path] of [
        ['libraries', linkedFolder],
        ['config-linked-root', linkedCopy],
      ]) {
        rmSync(path, { force: true });
        symlinkSync(target, path);
      }
      for (const root of [join(linkedFolder, 'config-linked-root'), linkedCopy]) {
        const library = resolveLibrary({ DOCS_LIBRARY: root });
        // The root as the caller gave it, which every message names a file from.
        assert.equal(library.root, root);
        assert.deepEqual(library.sampleFiles.map(relativeTo(root)), [
          'tests/NCode.Fixture.Tests/ExtensionSamples.cs',
          'tests/NCode.Fixture.Tests/QuickStartSamples.cs',
        ]);
      }
    },
  );

  it('stops the build with its message, before Astro starts', () => {
    const library = copyOfFixture('config-build');
    writeFileSync(join(library, CONFIG), '{ "title": ');
    const result = build('config-build', { library });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /docs\/site\/site\.config\.json is not valid JSON/);
    assert.doesNotMatch(result.output, /\[build\]/);
  });
});
