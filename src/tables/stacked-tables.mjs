// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// Below 40rem src/styles/theme.css stacks a table's cells under their column names. CSS cannot copy
// a head cell's text onto the cells below it, so this Sätteri hast plugin does it at build time: each
// body cell gets the text of its column's head cell as `data-label`, and the table gets the class
// `ncode-stacked`, which the CSS targets. A cell under an empty head cell gets no label and shows
// its value alone. A table written as HTML reaches the plugin as a JSX element in an `.mdx` page and
// as raw text in a `.md` page, so it is never matched and keeps its columns. The plugin also wraps the
// table in a `div.ncode-table`, which scrolls a table too wide for the content column even with its
// cells wrapped.
const STACKED = 'ncode-stacked';
const WRAPPER = 'ncode-table';

const childElements = (node, tagName) =>
  (node.children ?? []).filter((child) => child.type === 'element' && child.tagName === tagName);

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
            }
          }
        }
      },
    },
  });
}
