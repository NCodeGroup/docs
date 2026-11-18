// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// The requiredHeadings rules of a site configuration: which pages each rule covers, which rules are
// refused, and the check of one page's headings against the rules that cover it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { headingsPlugin, resolveHeadingRules } from '../src/headings/required-headings.mjs';

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
