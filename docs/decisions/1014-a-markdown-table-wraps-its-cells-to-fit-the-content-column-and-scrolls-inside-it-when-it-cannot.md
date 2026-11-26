# 1014. A Markdown table wraps its cells to fit the content column, and scrolls inside it when it cannot

- **Status:** Accepted (amended by 1015, 1021)
- **Date:** 2026-11-18
- **Deciders:** NCode Group
- **Amends:** 1007

## Context

From 50rem, `src/styles/theme.css` makes a Markdown table `display: table` with `overflow: hidden`, and its `th` and
the code in its first column are `white-space: nowrap`. A table box takes the width its content needs, so
`width: 100%` and `overflow: hidden` do not hold it in the column. A `display: table` box cannot scroll either.

Measured 2026-11-18 on the fixture with a five-column table of test names, the table extends past the content column by
457 px in a 1600 px window and by 857 px in an 800 px window, and it fits at 390 px, where ADR-1007 stacks it.
NCode.Buffers' four pages with a wide table extend 101 to 1188 px past the column at 1280 px
([#40](https://github.com/NCodeGroup/docs/issues/40)).

A `display: block` table scrolls, as Starlight's own table does, but its rows shrink to the width of their content
inside a frame as wide as the column, so the frame's right edge floats away from the rows.

## Decision

**A Markdown table's cells wrap, and the table sits in a `div.ncode-table` that scrolls sideways inside the content
column when the table still cannot fit.**

1. `src/tables/stacked-tables.mjs` wraps each Markdown table in `<div class="ncode-table">`, beside the class and the
   labels of ADR-1007.
2. `src/styles/theme.css` lets a head cell wrap and breaks code in a cell at any character with
   `overflow-wrap: anywhere`. From 40rem up, the table inside the wrapper stays `display: table` at the width of the
   column, so its frame spans the column, and the wrapper has `overflow-x: auto`. Below 40rem the stacked table is
   `display: block`.
3. A table written as HTML, or rendered by a component, is not wrapped, and it scrolls as a block at every width.
4. The layout check
   ([ADR-1013](1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md))
   reports a wrapper that scrolls, so a table that still cannot fit is seen when it is built.

## Options considered

- **`display: block` on every table, as Starlight does.** Rejected: the rows shrink inside a frame as wide as the
  column. On the same table it scrolls but leaves the frame empty on its right.
- **`table-layout: fixed`.** Rejected: every column gets the same width, so a short column is as wide as a long one.
- **A wrapper that scrolls around a `display: table` table** (chosen): the columns share the whole column and the
  frame spans it. Trial on the same table: it fits at 1440, 1280, 1152, 1024 and 900 px, and scrolls 38 px at 800 px.

## Consequences

- No Markdown table extends past the content column, and no library page changes.
- Long code in a cell breaks at any character instead of holding its line.
- A table that still cannot fit scrolls inside its wrapper and fails the layout check.
- The markup has one more `div` around each Markdown table.
- A Starlight or Sätteri update that changes table markup fails `test/tables.test.mjs` or `test/browser.test.mjs`.

## References

- `src/tables/stacked-tables.mjs`, `src/styles/theme.css`, `test/browser.test.mjs`
- [ADR-1007](1007-a-markdown-table-stacks-on-a-phone-with-its-cells-labelled-when-the-site-is-built.md): the stacked
  table.
- [ADR-1013](1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md):
  the layout check.
- [#40](https://github.com/NCodeGroup/docs/issues/40)
