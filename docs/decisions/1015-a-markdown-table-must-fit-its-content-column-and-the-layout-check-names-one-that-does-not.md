# 1015. A Markdown table must fit its content column, and the layout check names one that does not

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NCode Group
- **Amends:** 1013, 1014

## Context

ADR-1014 wraps each Markdown table in a `div.ncode-table` with `overflow-x: auto`, so a table too wide for the column
even with its cells wrapped scrolls inside it. The layout check of ADR-1013 fails every scroll container that hides
content sideways except `.expressive-code` and `[data-scrolls]`, and the wrapper is neither. An author cannot put
`data-scrolls` on a table written in Markdown.

NCodeGroup/Buffers at 7d1dc8d, checked with v0.14.0, has three Markdown tables that fail through the wrapper at
1280 px, hiding 22 to 1049 px ([#47](https://github.com/NCodeGroup/docs/issues/47)). The check names each
`div.ncode-table`, and its advice to let a table's cells wrap names what the build already does. `CONTRACT.md`
section 7 lays out data with more than three or four columns as a card per entry.

## Decision

**A Markdown table must fit the content column. The wrapper's sideways scroll is a last resort that the layout check
fails, and the check names the table and says how to make it fit.**

1. `div.ncode-table` keeps `overflow-x: auto`, so a published page that has such a table stays readable, and carries no
   `data-scrolls`. The check exempts no `.ncode-table`.
2. The check names a failing wrapper `Markdown table "<first> | <second> | <third> | …"` from the head cells of the
   table's first head row, the first three, with `…` when there are more, and appends
   `: a Markdown table must fit the column, so lay it out as a card per entry or give it fewer columns` to the problem.
3. The message's last line says a Markdown table must fit too, and that a component which scrolls sideways by design is
   marked `data-scrolls`.
4. A library that keeps a wide table on purpose renders it in a component of its own whose root is marked
   `data-scrolls`.
5. The fixture holds a table too wide for the column at 1280 px in `docs/site/_too-wide-table.md`, which is no page, so
   the fixture passes the check. `test/layout.test.mjs` copies it into a page of a copy of the fixture and reads the
   message.

## Options considered

- **The wrapper scrolls by design.** The plugin marks `div.ncode-table` with `data-scrolls`, or the check skips
  `.ncode-table` as it skips `.expressive-code`. Rejected: the check stops catching a table that hides most of its
  columns, such as the one that hides 1049 px, and a reader on a laptop scrolls to read a row.
- **A table must fit** (chosen): it is section 7's own advice, one rule holds for every Markdown table, and a failing
  page says which table and what to do.

## Consequences

- A library page with a Markdown table too wide for its column fails its build until the table fits, as Buffers' three
  do.
- The message tells two tables under one heading apart by their columns.
- A wide table kept on purpose is a component marked `data-scrolls`.

## References

- `src/layout/check.mjs`, `src/tables/stacked-tables.mjs`, `test/layout.test.mjs`,
  `fixture/docs/site/_too-wide-table.md`
- [ADR-1013](1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md):
  the layout check.
- [ADR-1014](1014-a-markdown-table-wraps-its-cells-to-fit-the-content-column-and-scrolls-inside-it-when-it-cannot.md):
  the table wrapper.
- [#47](https://github.com/NCodeGroup/docs/issues/47)
