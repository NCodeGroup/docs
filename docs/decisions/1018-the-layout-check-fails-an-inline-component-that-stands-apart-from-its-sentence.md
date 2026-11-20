# 1018. The layout check fails an inline component that stands apart from its sentence

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NCode Group
- **Amends:** 1013

## Context

An inline component, such as an evidence mark at the end of a sentence, stays in its paragraph or leaves it depending
on how the page's lines are written, and MDX decides:

- A line that holds only JSX tags, starting at column 0, becomes a block of its own, so a mark on the line under its
  sentence renders alone.
- A component written right after a block component, such as a card, renders below it, alone.
- In a list item that also holds a code block, a component on a line of its own renders under the code block.
- Wrapping a line between two inline components pushes the second one out of the paragraph.

[NCodeGroup/Buffers#114](https://github.com/NCodeGroup/Buffers/pull/114) found about 35 stranded marks in a browser
pass that its text checks missed ([#59](https://github.com/NCodeGroup/docs/issues/59)). Only a library knows which of
its components are inline.

## Decision

**A library marks the root of an inline component with `data-inline`, and the layout check fails one that stands apart
from the text it belongs to.**

1. The check reads each element marked `data-inline` in `main`. It skips earlier sibling nodes that are white-space
   text, comments or `[data-inline]` elements. The element stands apart when the nearest node is an element whose
   computed `display` does not start with `inline`, or when there is none and its parent is an `li`, `div` or
   `section`.
2. The check runs once per page, at the first width (1440 px), because stranding is structural.
3. The problem says the component stands apart from the text it belongs to, and the message tells an author to write an
   inline component marked `data-inline` on the line of the sentence it belongs to.
4. A row meant to stand alone is a paragraph of its own with a caption: `<p>Evidence <Proof … /></p>`.
5. `CONTRACT.md` section 7 states the placement rules and the attribute.

## Options considered

- **Document only.** Rejected: Buffers found its 35 stranded marks by hand.
- **Check every inline-level element.** Rejected: Starlight's own elements and a page's links would be reported.
- **Read the MDX lines as text.** Rejected: placement depends on the parse, lists and cards included, and a browser
  sees the result.
- **An opt-in attribute** (chosen): the library names its inline components, and the check judges the rendered page.

## Consequences

- A library that marks its inline components finds stranded ones in CI.
- A library that does not mark them is unaffected.
- A row of marks that stands alone on purpose is written as a captioned paragraph.

## References

- `src/layout/check.mjs`, `test/layout.test.mjs`, `fixture/docs/site/_components/Proof.astro`
- [ADR-1013](1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md):
  the layout check.
- [#59](https://github.com/NCodeGroup/docs/issues/59)
