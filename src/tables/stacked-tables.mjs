// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Below 40rem src/styles/theme.css stacks a table's cells under their column names. CSS cannot copy
// a head cell's text onto the cells below it, so this Sätteri hast plugin does it at build time: each
// body cell gets the text of its column's head cell as `data-label`, and the table gets the class
// `ncode-stacked`, which the CSS targets. A cell under an empty head cell gets no label and shows
// its value alone. A table written as HTML reaches the plugin as a JSX element in an `.mdx` page and
// as raw text in a `.md` page, so it is never matched and keeps its columns. The plugin also wraps the
// table in a `div.ncode-table`. A table too wide for the content column even with its cells wrapped
// scrolls sideways inside it, as a last resort that the layout check (src/layout/check.mjs) fails,
// naming the table: a Markdown table must fit the column (ADR-1015).
// Code in a body cell gets a <wbr> between its words, and src/styles/theme.css lets it break only there, so a
// column of code is never squeezed narrower than its longest word, even beside a column of prose (ADR-1021).
const STACKED = 'ncode-stacked';
const WRAPPER = 'ncode-table';
// Where code in a cell may break: after a `.`, `_`, `:`, `-` or `/` that follows a letter or digit, where a lowercase
// letter or a digit meets a capital, and before the capital that starts a word after an acronym, as in `XML|Http`.
const WORD_BREAK = /(?<=[\p{L}\p{N}][._:/-]+)(?=[^\s._:/-])|(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u;
// A run with no break longer than this, such as a hash, is cut every LONGEST characters, so it cannot hold its
// column wider than that.
const LONGEST = 20;

const childElements = (node, tagName) =>
  (node.children ?? []).filter((child) => child.type === 'element' && child.tagName === tagName);

/** The words of a code span's text, between which a line may break; joined, they are the text. */
export function codeWords(text) {
  const words = [];
  for (const part of text.split(WORD_BREAK)) {
    let start = 0;
    let run = 0;
    for (let index = 0; index < part.length; index++) {
      if (/\s/.test(part[index])) {
        run = 0;
        continue;
      }
      run++;
      if (run > LONGEST) {
        words.push(part.slice(start, index));
        start = index;
        run = 1;
      }
    }
    words.push(part.slice(start));
  }
  return words.filter(Boolean);
}

/** Puts a `<wbr>` between the words of each code span in `node`, a body cell, at any depth. */
function breakCode(node, ctx) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    if (child.tagName !== 'code') {
      breakCode(child, ctx);
      continue;
    }
    const children = (child.children ?? []).flatMap((inner) => {
      if (inner.type !== 'text') return [inner];
      return codeWords(inner.value).flatMap((word, index) => [
        ...(index > 0 ? [{ type: 'element', tagName: 'wbr', properties: {}, children: [] }] : []),
        { type: 'text', value: word },
      ]);
    });
    ctx.setField(child, 'children', children);
  }
}

export function stackedTables() {
  return () => ({
    name: 'ncode-stacked-tables',
    element: {
      filter: ['table'],
      visit(table, ctx) {
        const head = childElements(table, 'thead').flatMap((section) => childElements(section, 'tr'))[0];
        if (!head) return;
        const labels = childElements(head, 'th').map((cell) => ctx.textContent(cell).replace(/\s+/g, ' ').trim());
        ctx.setProperty(table, 'className', [STACKED]);
        ctx.wrapNode(table, { type: 'element', tagName: 'div', properties: { className: [WRAPPER] }, children: [] });
        for (const body of childElements(table, 'tbody')) {
          for (const row of childElements(body, 'tr')) {
            for (const [column, cell] of childElements(row, 'td').entries()) {
              if (labels[column]) ctx.setProperty(cell, 'dataLabel', labels[column]);
              breakCode(cell, ctx);
            }
          }
        }
      },
    },
  });
}
