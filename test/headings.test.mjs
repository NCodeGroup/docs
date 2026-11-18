// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The requiredHeadings rules of a site configuration: which pages each rule covers, which rules are
// refused, and the check of one page's headings against the rules that cover it.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { headingsPlugin, resolveHeadingRules } from '../src/headings/required-headings.mjs';
import { build, copyOfFixture, failingBuild, page as pageBody } from './helpers.mjs';

const LIBRARY = { configName: 'docs/site/site.config.json', contentPath: 'docs/site' };

const PAGES = ['guides/ban-leaky-apis', 'guides/review-checklist', 'guides/verify-a-mac', 'index', 'reference/api'].map(
  (slug) => ({ slug }),
);

const RULES = [
  { pages: ['guides/*'], headings: ['## The usual code', '## Checklist'], except: ['guides/review-checklist'] },
  { pages: ['guides/ban-leaky-apis'], headings: ['## Check your work'] },
];

describe('resolveHeadingRules', () => {
  it('gives no rule for no configuration', () => {
    assert.equal(resolveHeadingRules(undefined, PAGES, LIBRARY).size, 0);
    assert.equal(resolveHeadingRules([], PAGES, LIBRARY).size, 0);
  });

  it('maps each page to the rules that cover it', () => {
    const bySlug = resolveHeadingRules(RULES, PAGES, LIBRARY);
    const zero = { index: 0, globs: ['guides/*'], headings: ['## The usual code', '## Checklist'] };
    const one = { index: 1, globs: ['guides/ban-leaky-apis'], headings: ['## Check your work'] };
    assert.deepEqual(bySlug.get('guides/verify-a-mac'), [zero]);
    // Rules are independent: a page both rules name is covered by both.
    assert.deepEqual(bySlug.get('guides/ban-leaky-apis'), [zero, one]);
    assert.equal(bySlug.has('guides/review-checklist'), false);
    assert.equal(bySlug.has('index'), false);
    assert.equal(bySlug.has('reference/api'), false);
  });

  it('refuses a rule whose glob matches no page', () => {
    assert.throws(() => resolveHeadingRules([{ pages: ['guide/*'], headings: ['## Checklist'] }], PAGES, LIBRARY), {
      message: 'docs/site/site.config.json: requiredHeadings[0].pages "guide/*" matches no page in docs/site.',
    });
  });

  it('refuses an exception that no glob of the rule matches', () => {
    assert.throws(
      () =>
        resolveHeadingRules(
          [{ pages: ['guides/ban-*'], headings: ['## Checklist'], except: ['guides/old'] }],
          PAGES,
          LIBRARY,
        ),
      {
        message:
          'docs/site/site.config.json: requiredHeadings[0].except "guides/old" is not a page that requiredHeadings[0].pages matches.',
      },
    );
  });

  it('refuses a heading listed twice, once, at its second listing', () => {
    assert.throws(
      () =>
        resolveHeadingRules(
          [{ pages: ['guides/*'], headings: ['## Checklist', '## Other', '## Checklist'] }],
          PAGES,
          LIBRARY,
        ),
      {
        message: 'docs/site/site.config.json: requiredHeadings[0].headings lists "## Checklist" twice.',
      },
    );
  });

  it('reports every problem in one error', () => {
    assert.throws(
      () =>
        resolveHeadingRules(
          [
            { pages: ['guide/*'], headings: ['## Checklist'] },
            { pages: ['guides/*'], headings: ['## A', '## A'], except: ['index'] },
          ],
          PAGES,
          LIBRARY,
        ),
      {
        message: [
          'docs/site/site.config.json has wrong requiredHeadings:',
          '  requiredHeadings[0].pages "guide/*" matches no page in docs/site.',
          '  requiredHeadings[1].except "index" is not a page that requiredHeadings[1].pages matches.',
          '  requiredHeadings[1].headings lists "## A" twice.',
        ].join('\n'),
      },
    );
  });
});

describe('headingsPlugin', () => {
  const slugOf = (file) => (file.endsWith('guide.mdx') ? 'guides/guide' : 'other');
  const describePage = () => 'docs/site/guides/guide.mdx';
  const bySlug = new Map([
    ['guides/guide', [{ index: 0, globs: ['guides/*', 'tips/*'], headings: ['## Before', '## Checklist'] }]],
  ]);

  /** Runs the plugin over a page's headings, as `[depth, text]` pairs. */
  function check(path, headings, map = bySlug) {
    const [, factory] = headingsPlugin(map, { describePage, slugOf, configName: LIBRARY.configName });
    const visitor = factory({ fileURL: pathToFileURL(path) });
    for (const [depth, text] of headings) {
      assert.equal(visitor.heading({ depth }, { textContent: () => ` ${text}\n` }), undefined);
    }
    visitor.after();
  }
  const page = (headings) => check('/library/docs/site/guides/guide.mdx', headings);

  it('keys the cache by the rules', () => {
    const [key] = headingsPlugin(bySlug, { describePage, slugOf, configName: LIBRARY.configName });
    assert.deepEqual(key, {
      name: 'ncode-required-headings-cache-key',
      rules: JSON.stringify([...bySlug]),
    });
  });

  it('passes a page with the headings in order, others between', () => {
    page([
      [1, 'Title'],
      [2, 'Before'],
      [3, 'Detail'],
      [2, 'Checklist'],
    ]);
  });

  it('refuses a page without a listed heading', () => {
    assert.throws(() => page([[2, 'Before']]), {
      message:
        'docs/site/guides/guide.mdx has no "## Checklist" heading, which requiredHeadings[0] in docs/site/site.config.json requires on every page its globs match (guides/*, tips/*). Add the heading, or add "guides/guide" to that rule\'s "except".',
    });
  });

  it('does not take a heading of another level', () => {
    assert.throws(
      () =>
        page([
          [2, 'Before'],
          [3, 'Checklist'],
        ]),
      { message: /has no "## Checklist" heading/ },
    );
  });

  it('refuses headings out of order', () => {
    assert.throws(
      () =>
        page([
          [2, 'Checklist'],
          [2, 'Before'],
        ]),
      {
        message:
          'docs/site/guides/guide.mdx has "## Before" after "## Checklist", and requiredHeadings[0] in docs/site/site.config.json lists them in this order: "## Before", "## Checklist".',
      },
    );
  });

  it('passes a page no rule covers', () => {
    check('/library/docs/site/index.mdx', [[2, 'Anything']]);
  });

  it('passes a page with no rule at all', () => {
    check('/library/docs/site/guides/guide.mdx', [], new Map());
  });
});

const CONFIG = 'docs/site/site.config.json';
const CHECKLIST = /## Checklist\n[\s\S]*?(?=<LinkButton)/;

/** Rewrites a copy's site configuration with `requiredHeadings` set, or deleted for `undefined`. */
function setRules(library, rules) {
  const file = join(library, CONFIG);
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (rules === undefined) delete config.requiredHeadings;
  else config.requiredHeadings = rules;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

/** Rewrites the page `docs/site/<slug>.mdx` of a copy through `change`. */
function editPage(library, slug, change) {
  const file = join(library, 'docs/site', `${slug}.mdx`);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
}

/** Builds a copy of the fixture that `change` has edited, and expects the build to pass. */
function passingBuild(name, change) {
  const library = copyOfFixture(name);
  change(library);
  const result = build(name, { library });
  assert.equal(result.code, 0, result.output);
}

const missing = (page, globs, slug) =>
  `${page} has no "## Checklist" heading, which requiredHeadings[0] in ${CONFIG} requires on every page its globs match (${globs}). Add the heading, or add "${slug}" to that rule's "except".`;

describe('a required heading the build checks', () => {
  it('fails a page without a heading its rule requires', () => {
    const output = failingBuild('headings-missing', (library) => {
      editPage(library, 'guides/derive-a-key', (text) => text.replace(CHECKLIST, ''));
    });
    assert.ok(
      output.includes(
        missing('docs/site/guides/derive-a-key.mdx', 'guides/derive-*, guides/ban-*', 'guides/derive-a-key'),
      ),
      output,
    );
  });

  it('fails headings in the wrong order', () => {
    const output = failingBuild('headings-order', (library) => {
      setRules(library, [
        { pages: ['guides/*'], headings: ['## Before', '## Checklist'], except: ['guides/extension-members'] },
      ]);
      for (const slug of ['guides/derive-a-key', 'guides/ban-apis']) {
        editPage(library, slug, (text) =>
          text.replace('## Checklist', '## Before\n\nA sentence first.\n\n## Checklist'),
        );
      }
      writeFileSync(
        join(library, 'docs/site/guides/broken.mdx'),
        pageBody('## Checklist\n\n- one\n\n## Before\n\nText.'),
      );
    });
    assert.ok(
      output.includes(
        `docs/site/guides/broken.mdx has "## Before" after "## Checklist", and requiredHeadings[0] in ${CONFIG} lists them in this order: "## Before", "## Checklist".`,
      ),
      output,
    );
  });

  it('fails a rule whose glob matches no page, before Astro starts', () => {
    const output = failingBuild('headings-no-page', (library) => {
      setRules(library, [{ pages: ['guide/*'], headings: ['## Checklist'] }]);
    });
    assert.ok(output.includes(`${CONFIG}: requiredHeadings[0].pages "guide/*" matches no page in docs/site.`), output);
    assert.ok(!output.includes('[build]'), output);
  });

  it('fails an exception the rule does not cover', () => {
    const output = failingBuild('headings-stale-except', (library) => {
      setRules(library, [
        { pages: ['guides/derive-*', 'guides/ban-*'], headings: ['## Checklist'], except: ['guides/old'] },
      ]);
    });
    assert.ok(
      output.includes(
        `${CONFIG}: requiredHeadings[0].except "guides/old" is not a page that requiredHeadings[0].pages matches.`,
      ),
      output,
    );
  });

  it('fails a heading listed twice', () => {
    const output = failingBuild('headings-twice', (library) => {
      setRules(library, [{ pages: ['guides/derive-*', 'guides/ban-*'], headings: ['## Checklist', '## Checklist'] }]);
    });
    assert.ok(output.includes(`${CONFIG}: requiredHeadings[0].headings lists "## Checklist" twice.`), output);
  });

  it('checks a .md page as it checks a .mdx page', () => {
    const output = failingBuild('headings-plain-md', (library) => {
      setRules(library, [{ pages: ['guides/*'], headings: ['## Checklist'], except: ['guides/extension-members'] }]);
      writeFileSync(join(library, 'docs/site/guides/plain.md'), pageBody('Text without a checklist.'));
    });
    assert.ok(output.includes(missing('docs/site/guides/plain.md', 'guides/*', 'guides/plain')), output);
  });

  it('does not count a heading inside a code block', () => {
    const output = failingBuild('headings-in-code', (library) => {
      editPage(library, 'guides/derive-a-key', (text) => text.replace('## Checklist', '```md\n## Checklist\n```'));
    });
    assert.ok(
      output.includes(
        missing('docs/site/guides/derive-a-key.mdx', 'guides/derive-*, guides/ban-*', 'guides/derive-a-key'),
      ),
      output,
    );
  });

  it('does not take a heading of another level', () => {
    const output = failingBuild('headings-level', (library) => {
      editPage(library, 'guides/derive-a-key', (text) => text.replace('## Checklist', '### Checklist'));
    });
    assert.ok(
      output.includes(
        missing('docs/site/guides/derive-a-key.mdx', 'guides/derive-*, guides/ban-*', 'guides/derive-a-key'),
      ),
      output,
    );
  });

  it('matches the text a reader sees, not the Markdown', () => {
    passingBuild('headings-inline-code', (library) => {
      setRules(library, [{ pages: ['guides/derive-*'], headings: ['## Checklist for Vault'] }]);
      editPage(library, 'guides/derive-a-key', (text) => text.replace('## Checklist', '## Checklist for `Vault`'));
    });
  });

  it('counts a heading in the children of a component', () => {
    passingBuild('headings-in-component', (library) => {
      editPage(library, 'guides/derive-a-key', (text) =>
        text
          .replace(
            "import { LinkButton } from '@ncodegroup/docs/components';",
            "import { Aside, LinkButton } from '@ncodegroup/docs/components';",
          )
          .replace(CHECKLIST, (section) => `<Aside>\n\n${section.trimEnd()}\n\n</Aside>\n\n`),
      );
    });
  });

  it('checks nothing when the configuration has no rule', () => {
    passingBuild('headings-off', (library) => {
      setRules(library, undefined);
      editPage(library, 'guides/derive-a-key', (text) => text.replace(CHECKLIST, ''));
    });
  });
});
