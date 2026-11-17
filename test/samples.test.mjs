// Each way a sample can be wrong fails the build, with a message that names the page or the sample
// file, and the key.
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { build, copyOfFixture } from './helpers.mjs';

const SAMPLES = 'tests/NCode.Fixture.Tests/QuickStartSamples.cs';

/** Builds a copy of the fixture after `change` has edited it, and expects the build to fail. */
function failingBuild(name, change) {
  const library = copyOfFixture(name);
  change(library);
  const result = build(name, { library });
  assert.notEqual(result.code, 0, `the build should have failed:\n${result.output}`);
  return result.output;
}

const page = (body) => `---\ntitle: A broken page\n---\n\n${body}\n`;

describe('a wrong sample fails the build', () => {
  it('a key no sample file defines', () => {
    const output = failingBuild('missing-key', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.mdx'), page('```cs snippet=NoSuchSample\n```'));
    });
    assert.match(
      output,
      /Snippet "NoSuchSample", which docs\/site\/guides\/broken\.mdx uses, is not defined in the library's sample files\./,
    );
    assert.match(output, /Defined: DeriveKey, QuickStart, VaultExtensions/);
  });

  it('a key defined twice', () => {
    const output = failingBuild('duplicate-key', (library) => {
      appendFileSync(
        join(library, 'tests/NCode.Fixture.Tests/ExtensionSamples.cs'),
        '\n// begin-snippet: QuickStart\nvar again = 1;\n// end-snippet\n',
      );
    });
    assert.match(
      output,
      /tests\/NCode\.Fixture\.Tests\/QuickStartSamples\.cs:\d+: snippet "QuickStart" is already defined at tests\/NCode\.Fixture\.Tests\/ExtensionSamples\.cs:\d+/,
    );
  });

  it('a region that is never closed', () => {
    const output = failingBuild('unclosed-region', (library) => {
      appendFileSync(join(library, SAMPLES), '\n// begin-snippet: NeverClosed\nvar open = 1;\n');
    });
    assert.match(
      output,
      /tests\/NCode\.Fixture\.Tests\/QuickStartSamples\.cs:\d+: snippet "NeverClosed" has no end marker/,
    );
  });

  it('a malformed marker', () => {
    const output = failingBuild('malformed-marker', (library) => {
      const file = join(library, SAMPLES);
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace('// begin-snippet: DeriveKey', '//begin-snippet:DeriveKey'),
      );
    });
    assert.match(
      output,
      /tests\/NCode\.Fixture\.Tests\/QuickStartSamples\.cs:\d+: malformed snippet marker "\/\/begin-snippet:DeriveKey"/,
    );
  });

  it('a key that is not a key', () => {
    const output = failingBuild('bad-key', (library) => {
      appendFileSync(join(library, SAMPLES), '\n// begin-snippet: Has Space\nvar x = 1;\n// end-snippet\n');
    });
    assert.match(output, /QuickStartSamples\.cs:\d+: "Has Space" is not a snippet key/);
  });

  it('an end marker without a begin marker', () => {
    const output = failingBuild('stray-end', (library) => {
      appendFileSync(join(library, SAMPLES), '\n// end-snippet\n');
    });
    assert.match(output, /tests\/NCode\.Fixture\.Tests\/QuickStartSamples\.cs:\d+: end marker without a begin marker/);
  });

  it('an empty region', () => {
    const output = failingBuild('empty-region', (library) => {
      appendFileSync(join(library, SAMPLES), '\n// begin-snippet: Nothing\n\n// end-snippet\n');
    });
    assert.match(output, /tests\/NCode\.Fixture\.Tests\/QuickStartSamples\.cs:\d+: snippet "Nothing" is empty/);
  });

  it('a sample block that names another language than the sample has', () => {
    const output = failingBuild('other-language', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.mdx'), page('```js snippet=QuickStart\n```'));
    });
    assert.match(output, /docs\/site\/guides\/broken\.mdx: snippet=QuickStart is cs, but the code block says js\./);
  });

  it('a sample block without a language, which would be published empty', () => {
    const output = failingBuild('no-language', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.mdx'), page('``` snippet=QuickStart\n```'));
    });
    assert.match(
      output,
      /docs\/site\/guides\/broken\.mdx: a code block with snippet=QuickStart needs its language first/,
    );
  });

  it('a key no sample file defines, in a library whose globs match no sample', () => {
    const output = failingBuild('no-samples', (library) => {
      const file = join(library, 'docs/site/site.config.json');
      writeFileSync(file, readFileSync(file, 'utf8').replace('"tests/**/*.cs"', '"test/**/*.cs"'));
    });
    assert.match(
      output,
      /Snippet "\w+", which docs\/site\/[\w/-]+\.mdx uses, is not defined in the library's sample files\. No sample file defines a region: check the "samples" globs/,
    );
  });

  it('a marker in another case', () => {
    const output = failingBuild('marker-case', (library) => {
      appendFileSync(join(library, SAMPLES), '\n// Begin-Snippet: OtherCase\nvar x = 1;\n// End-Snippet\n');
    });
    assert.match(output, /QuickStartSamples\.cs:\d+: malformed snippet marker "\/\/ Begin-Snippet: OtherCase"/);
  });

  it('a sample block that holds code of its own', () => {
    const output = failingBuild('not-empty', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.mdx'), page('```cs snippet=QuickStart\nvar copy = 1;\n```'));
    });
    assert.match(output, /docs\/site\/guides\/broken\.mdx: a code block with snippet=QuickStart must be empty/);
  });
});

describe('a wrong link fails the build', () => {
  it('a link to a page that does not exist', () => {
    const output = failingBuild('broken-link', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.mdx'), page('See [nothing](/guides/no-such-page/).'));
    });
    assert.match(output, /\/guides\/no-such-page\//);
    assert.match(output, /invalid link/i);
  });

  it('a relative link, a link without its trailing slash and a link to a heading that does not exist', () => {
    const output = failingBuild('invalid-links', (library) => {
      writeFileSync(
        join(library, 'docs/site/guides/broken.mdx'),
        page(
          'A [relative link](../quick-start/), a [link without its slash](/quick-start) and a [missing heading](/quick-start/#no-such-heading).',
        ),
      );
    });
    assert.match(output, /\.\.\/quick-start\/\s+.*relative link/);
    assert.match(output, /\/Fixture\/quick-start\s+.*missing trailing slash/);
    assert.match(output, /\/Fixture\/quick-start\/#no-such-heading\s+.*invalid hash/);
    assert.match(output, /Found 3 invalid links in 1 file/);
  });

  it('a link written with the base path, in a page and in a hero action', () => {
    const inPage = failingBuild('base-in-link', (library) => {
      writeFileSync(
        join(library, 'docs/site/guides/broken.mdx'),
        page('See the [quick start](/Fixture/quick-start/).'),
      );
    });
    assert.match(
      inPage,
      /docs\/site\/guides\/broken\.mdx: the link \/Fixture\/quick-start\/ starts with the site's base path \/Fixture\. Write it from the site's root, as \/quick-start\//,
    );
    const inHero = failingBuild('base-in-hero', (library) => {
      const file = join(library, 'docs/site/index.mdx');
      writeFileSync(file, readFileSync(file, 'utf8').replace('link: /quick-start/', 'link: /Fixture/quick-start/'));
    });
    assert.match(
      inHero,
      /docs\/site\/index\.mdx \(hero action "Get started"\): the link \/Fixture\/quick-start\/ starts with the site's base path/,
    );
  });

  it('a link written as HTML with the base path, in a plain Markdown page', () => {
    const output = failingBuild('base-in-html', (library) => {
      writeFileSync(
        join(library, 'docs/site/guides/broken.md'),
        page('See the <a href="/Fixture/quick-start/">quick start</a>.'),
      );
    });
    assert.match(
      output,
      /docs\/site\/guides\/broken\.md: the link \/Fixture\/quick-start\/ starts with the site's base path \/Fixture\. Write it from the site's root, as \/quick-start\//,
    );
  });

  it('a link in HTML that the build adds no base path to', () => {
    const output = failingBuild('html-other-tag', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.md'), page("<video poster='/poster.png'></video>"));
    });
    assert.match(
      output,
      /A link leaves the site's base path \/Fixture:\s+\/guides\/broken\/index\.html links to \/poster\.png/,
    );
  });

  it('a sidebar link to a page that does not exist', () => {
    const output = failingBuild('sidebar-link', (library) => {
      const file = join(library, 'docs/site/site.config.json');
      const config = JSON.parse(readFileSync(file, 'utf8'));
      config.sidebar[0].items.push({ label: 'Nowhere', link: '/guides/no-such-page/' });
      writeFileSync(file, JSON.stringify(config));
    });
    assert.match(
      output,
      /A link leads to nothing the site has:\s+\/Fixture\/guides\/no-such-page\/ \(on the built pages /,
    );
    assert.match(output, /check each "link" of the sidebar in site\.config\.json/);
  });

  it('a link a component computes without the base path', () => {
    const output = failingBuild('computed-link', (library) => {
      writeFileSync(join(library, 'docs/site/guides/broken.mdx'), page("<a href={'/quick-start/'}>computed</a>"));
    });
    assert.match(
      output,
      /A link leaves the site's base path \/Fixture:\s+\/guides\/broken\/index\.html links to \/quick-start\//,
    );
  });
});
