# 1020. The sidebar, the page and the page index stand together in the middle of a wide window, and a hero with no image is one column

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** NCode Group

## Context

Starlight fixes the sidebar to the window's left edge, centres the content column in what is left, and gives the "On
this page" panel half of the remainder (`PageFrame.astro` and `TwoColumnContent.astro` of `@astrojs/starlight` 0.43.1,
read 2026-11-24). The theme starts the text at the sheet's left edge. Measured on NCode.PropertyBag's site in a window
of 1905 by 1415 pixels (2026-11-24): the text column is the left third of the window, the sheet runs on for 400 px
with nothing in them, and the panel's entries stand in an otherwise empty column of 550 px.

Starlight's hero is a grid of two columns, `7fr 4fr`, from 50rem up, whether or not the page has a hero image
(`Hero.astro`, same version). A landing page with no image keeps 7/11 of its content column for its copy, about 490 px
beside the sidebar, and a headline of four words breaks after two.

The brand's own documentation scene, `.docs__frame` in its `css/base.css`, is a grid of the selector, the sheet and
the page index, no wider than 90rem, in the middle of the window, with the selector and the index at its dense
interface size ([NCode Brand: Layout and density](https://brand.ncode.io/guide/05-layout.html)). The brand's
stylesheets set no rule for Starlight's markup
([ADR-1008](1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md)).

## Decision

**The theme keeps the sidebar, the page and the page index together in the middle of a window wider than the three,
gives a hero with no image one column, and sets the sidebar, the page index, tables, callouts and link buttons at the
interface's sizes.**

1. The frame is as wide as its parts: `--sl-sidebar-width`, the sheet around a listing of `--sl-content-width` with
   its padding, edges and margin, and a page index of 15rem. `--ncode-gutter` is half of what a wider window leaves.
   The site bar, the sidebar's pane and the main frame each take the gutter, so the margin is the same on both sides.
2. From 72rem, where Starlight shows the panel, the page is the frame less the panel's 15rem, not the content width
   plus half the remainder. The panel is as wide as its list.
3. The site bar's first column is as wide as the sidebar, so the search field starts where the page does.
4. A hero with no `img`, `picture` or `.hero-html` child is one column at every width.
5. On a landing page beside the sidebar, the hero and a `CardGrid` take the width of the page. Every other part keeps
   to `--sl-content-width` by a rule of no specificity, so the brand's measure and a component's own width win.
6. The sidebar and the page index are set at Starlight's `xs` step, which the brand maps to its dense interface size,
   with entries `--nc-control-sm` high. A table, a callout and a card's text are at the interface size. A link button
   is `--nc-control-md` high, and `--nc-control-lg` in a window narrower than 40rem. A listing's line height is the
   brand's `code` role's.
7. `test/browser.test.mjs` measures the content column at each width the layout check loads and fails when the table
   in `CONTRACT.md` section 7 differs, and checks the frame's margins, the hero and the landing page's widths.

## Options considered

- *The frame in the theme* (chosen). The rules name Starlight's `.main-frame`, `.sidebar-pane`, `.main-pane`,
  `.right-sidebar-container` and `.hero`, which is what the theme is for: the rules that depend on one Starlight
  version's markup.
- *Starlight's layout as it is.* The sizes follow the brand, and the right half of a wide window stays empty.
- *The content centred, the sidebar at the window's edge.* The sidebar here is a plate of the frame, not a pane of
  the window: the distance between it and the text it selects grows with the window.
- *A content column as wide as the window allows.* A line of text at the brand's measure leaves it empty, and a line
  as wide as the column is past 120 characters.
- *A second landing template without the sidebar.* `splash` is that template. A landing page the sidebar lists keeps
  the sidebar ([#42](https://github.com/NCodeGroup/docs/issues/42)).

## Consequences

- A window of 1440 px gives a page a content column of about 49rem and one of 1280 px about 39rem, beside the panel.
  The column is narrowest in a window of 72rem, about 31rem. `CONTRACT.md` states these, and that a hero and a
  `CardGrid` on a landing page are wider than the column.
- A brand release that changes `--sl-sidebar-width`, `--sl-content-width` or `--sl-content-pad-x` moves the column:
  the test fails until `CONTRACT.md`'s table is measured again.
- A Starlight release that renames a class the frame's rules name leaves a page with Starlight's own layout. The
  tests on the frame's margins and on the hero fail then.

## References

- `src/styles/theme.css`, sections 1, 4, 5, 6 and 9; `test/browser.test.mjs`; `CONTRACT.md` sections 3 and 7.
- [ADR-1013](1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md):
  the layout check and its widths.
