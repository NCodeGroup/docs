// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// A table written in Markdown carries its column names on its cells; a table written as HTML is left alone.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { build, copyOfFixture } from './helpers.mjs';

describe('the tables of a page', () => {
  const library = copyOfFixture('tables');
  writeFileSync(
    join(library, 'docs/site/guides/tables.md'),
    [
      '---',
      'title: Tables',
      '---',
      '',
      '| | One `two` | Three |',
      '| --- | --- | --- |',
      '| a | b | c |',
      '',
      '<table><thead><tr><th>Raw</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>',
      '',
      '| Code | Kept `Head.Code` |',
      '| --- | --- |',
      '| `Rent_LengthLessThanZero` | `Vault.Rent(int, out Span)` |',
      '| [`XMLHttpRequest`](/quick-start/) | `concepts/outages.mdx`, `Pool.Size:max` and `curby-q` |',
      '| `.NET` and `--verbose` | `0123456789abcdef0123456789abcdef` |',
      '',
      'Outside a table `PulseNotFound` is whole.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(library, 'docs/site/guides/html-table.mdx'),
    [
      '---',
      'title: An HTML table',
      '---',
      '',
      '<table>',
      '  <thead><tr><th>Name</th></tr></thead>',
      '  <tbody><tr><td>Value</td></tr></tbody>',
      '</table>',
      '',
    ].join('\n'),
  );
  const result = build('tables', { library });
  const page = (path) => readFileSync(join(result.out, path, 'index.html'), 'utf8');

  it('builds', () => {
    assert.equal(result.code, 0, result.output);
  });

  it('labels each cell of a Markdown table with its column name', () => {
    const html = page('reference/api');
    assert.match(html, /<div class="ncode-table"><table class="ncode-stacked">/);
    const labels = [...html.matchAll(/<td data-label="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(labels, Array(4).fill(['Member', 'Returns', 'Notes']).flat());
  });

  it('labels the cells of a .md page by the text of their head, and leaves a cell under an empty head without one', () => {
    assert.match(
      page('guides/tables'),
      /<td>a<\/td>\s*<td data-label="One two">b<\/td>\s*<td data-label="Three">c<\/td>/,
    );
  });

  it('breaks code in a body cell only between its words, and leaves other code whole', () => {
    const html = page('guides/tables');
    const code = (text) => new RegExp(`<code[^>]*>${text}</code>`);
    for (const text of [
      'Rent_<wbr>Length<wbr>Less<wbr>Than<wbr>Zero',
      'Vault\\.<wbr>Rent\\(int, out Span\\)',
      'XML<wbr>Http<wbr>Request',
      'concepts/<wbr>outages\\.<wbr>mdx',
      'Pool\\.<wbr>Size:<wbr>max',
      'curby-<wbr>q',
      '\\.NET',
      '--verbose',
      '0123456789abcdef0123<wbr>456789abcdef',
      'Head\\.Code',
      'PulseNotFound',
    ])
      assert.match(html, code(text));
  });

  it('leaves a table written as HTML as it is', () => {
    assert.match(
      page('guides/tables'),
      /<table><thead><tr><th>Raw<\/th><\/tr><\/thead><tbody><tr><td>x<\/td><\/tr><\/tbody><\/table>/,
    );
    const html = page('guides/html-table');
    assert.match(html, /<td>Value<\/td>/);
    assert.doesNotMatch(html, /ncode-stacked|ncode-table|data-label/);
  });
});
