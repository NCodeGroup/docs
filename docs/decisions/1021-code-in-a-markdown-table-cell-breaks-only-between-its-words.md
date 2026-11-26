# 1021. Code in a Markdown table cell breaks only between its words

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** NCode Group
- **Amends:** 1014

## Context

ADR-1014 breaks code in a table cell at any character with `overflow-wrap: anywhere`, so a table of long identifiers,
such as test names, fits the content column. That rule makes a code span's narrowest width one character. Automatic
table layout gives each column its narrowest width and shares the rest in proportion to how much wider each column's
content is, so a column of prose takes nearly all of it and squeezes a column of short names beside it until they
break inside a word.

Measured 2026-11-25 in headless Chromium on a copy of the fixture with the tables of
[#71](https://github.com/NCodeGroup/docs/issues/71): at 1024 and 1280 px a column of code beside a column of prose is
about 95 px wide and shows `Unavaila`/`ble`, `PulseNot`/`Found` and `RefreshInter`/`val`, while every table fits its
column. `overflow-wrap: break-word` alone keeps each name whole, but then a test name such as
`Rent_LengthLessThanNegativeOne_ThrowsArgumentOutOfRangeException` holds its column that wide and pushes its table past
the content column.

## Decision

**The build marks where code in a Markdown table's body cell may break, and the cell breaks it only there.**

1. `src/tables/stacked-tables.mjs` puts a `<wbr>` between the words of each code span in a body cell, at any depth,
   such as inside a link: after a `.`, `_`, `:`, `-` or `/` that follows a letter or digit, where a lowercase letter or
   a digit meets a capital, and before the capital that starts a word after an acronym. A run of more than 20
   characters with no such break, such as a hash, gets one every 20 characters.
2. `src/styles/theme.css` sets `overflow-wrap: break-word` on code in a cell, so a column of code is never narrower
   than its longest word.
3. Code in a head cell, in a table written as HTML and outside a table gets no `<wbr>`.
4. `fixture/docs/site/reference/behaviour.mdx` holds a column of short names beside a column of prose, and
   `test/browser.test.mjs` fails when code in it breaks inside a word at 1280 or 1024 px or the table leaves the column.

## Options considered

- **Break anywhere** (ADR-1014): every table fits, but short names beside prose break inside a word.
- **A minimum width for a cell of code**, such as `min-width: min(14ch, 30%)`. Measured: the percentage has no effect
  in Chromium; `14ch` keeps names up to about 14 characters whole but still breaks longer ones at any character
  (`PulseNotFoun`/`d`); `9rem` pushes the fixture's five-column table of test names 80 px past the column at 1024 px.
  Rejected: any floor is too small for some names or too wide for some tables.
- **A break between words** (chosen): a column's narrowest width is its longest word, so the five-column table of test
  names still fits at 1440, 1280 and 1024 px, and a name breaks only where one of its words ends.

## Consequences

- A name with no break in it, such as `Disposed`, keeps its line whenever its table fits. A name of several words may
  still break between them beside a column of prose (`PulseNot`/`Found`), because the layout shares spare width by
  each column's content.
- The characters of a code span are those the page wrote: copying it, the search index and a screen reader read it as
  written.
- The markup carries a `<wbr>` between the words of code in a body cell.

## References

- `src/tables/stacked-tables.mjs`, `src/styles/theme.css`, `test/tables.test.mjs`, `test/browser.test.mjs`,
  `fixture/docs/site/reference/behaviour.mdx`
- [ADR-1014](1014-a-markdown-table-wraps-its-cells-to-fit-the-content-column-and-scrolls-inside-it-when-it-cannot.md):
  the table wrapper and its wrapping cells.
- [ADR-1015](1015-a-markdown-table-must-fit-its-content-column-and-the-layout-check-names-one-that-does-not.md): a
  Markdown table must fit its column.
- [#71](https://github.com/NCodeGroup/docs/issues/71)
