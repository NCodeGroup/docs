# 1007. A Markdown table stacks on a phone, with its cells labelled when the site is built

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** NCode Group

## Context

In a 390 px window a page's content column is 330 px. Measured 2026-11-16 on NCode.Buffers' site
([NCodeGroup/Buffers#66](https://github.com/NCodeGroup/Buffers/pull/66)), six Markdown tables are wider than the
column, from 383 px (the two-column pitfalls symptom index) to 627 px (the four-column ownership table). Each scrolls
sideways inside itself with its last column cut off.

Listings written to fit the column at 1440 px scroll sideways on a phone with nothing that shows it. Expressive Code
makes a listing that scrolls focusable, and the theme's focus ring sits outside the screen.

CSS `attr()` reads only the element's own attributes, so CSS alone cannot put a column's name on its cells.

## Decision

**Below 40rem (640 px), the brand's phone width, every table written in Markdown is a stack of rows, each cell under
its column's name, which the build copies onto the cell; a listing keeps its lines and scrolls, lighting the edge it
has more code past, and its focus ring is lit and drawn inside its edge.**

1. `src/tables/stacked-tables.mjs`, a Sätteri hast plugin, gives each Markdown table the class `ncode-stacked` and each
   body cell a `data-label` with its head cell's text; a cell under an empty head cell gets none.
2. `src/styles/theme.css` stacks a `table.ncode-stacked` below 40rem, shows each label engraved above its value through
   `::before`, and keeps the head row visually hidden for screen readers.
3. A table written as HTML, or rendered by a component, is not stacked.
4. A listing's background holds two covers that scroll with the code and two lit edges that stay with the box, so an
   edge shows only where code is hidden past it; no script measures anything.
5. The focus ring follows `src/css/base.css` of NCodeGroup/brand.

## Options considered

- **A component a page opts into.** Rejected: every table on every library page needs an edit, and one left out keeps
  the sideways scroll.
- **Stacking only tables of three or more columns.** Rejected: the two-column pitfalls index is 383 px wide.
- **A client-side script that labels the cells.** Rejected: the layout shifts once the script runs, and the site ships
  script for what the build writes once.
- **Wrapping long code lines on a phone.** Rejected: a wrapped line no longer matches the line a reader types or
  compares.
- **Every Markdown table, labelled when the site is built** (chosen): no page changes, and the HTML is complete before
  it reaches a browser.

## Consequences

- No Markdown table makes a phone reader scroll sideways, and no library page changes.
- A short table that fits a phone stacks too.
- A table's head cells are its labels on a phone, so a head is best a short name.
- A library component that wraps a Markdown table still gets the stacked layout below 40rem.
- A Starlight or Sätteri update that changes table markup fails `test/tables.test.mjs` or `test/browser.test.mjs`.

## References

- `src/tables/stacked-tables.mjs`, `src/styles/theme.css`, `astro.config.mjs`, `CONTRACT.md`
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): the site generator.
- [#3](https://github.com/NCodeGroup/docs/issues/3)
- [NCodeGroup/Buffers#66](https://github.com/NCodeGroup/Buffers/pull/66)
