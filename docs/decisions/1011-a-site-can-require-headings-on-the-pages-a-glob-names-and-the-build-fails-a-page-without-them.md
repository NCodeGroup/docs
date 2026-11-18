# 1011. A site can require headings on the pages a glob names, and the build fails a page without them

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NCode Group

## Context

A library keeps a skeleton for a kind of page: NCodeGroup/Buffers' guides end with `## Checklist`, and a guide
without it is incomplete. Nothing in the library's build holds the skeleton
([NCodeGroup/Buffers#82](https://github.com/NCodeGroup/Buffers/issues/82), and the owner's plan on
[NCodeGroup/Buffers#68](https://github.com/NCodeGroup/Buffers/issues/68)).

A scan in the library's own gate duplicates the Markdown parser: it must tell a heading from a line in a code block, and
it cannot see what the build renders, such as a heading a component writes or a page the build leaves out.

## Decision

**A library states, in `site.config.json`, the headings the pages a glob names must have, in order. The build stops on
a page that lacks one or has them out of order, and on a rule that names no page.**

1. `requiredHeadings` is an optional list of rules, with no default rule. A rule has `pages`, at least one glob of page
   slugs matched with `posix.matchesGlob`; `headings`, at least one string of `##` to `######`, a space and the text a
   reader sees; and optionally `except`, at least one slug the rule leaves out. Rules are independent.
2. A page has every heading its rule lists, and their first appearances come in the listed order; other headings may
   come between. A heading's text is the text of the rendered heading, trimmed, matched exactly and case-sensitively, at
   its level. A heading inside a code block, rendered by a component or written as HTML does not count; one in a
   component's children does.
3. `scripts/site.mjs` and `astro.config.mjs` check the rules before Astro starts, with one message: a glob that matches
   no page, an `except` that is not a page the rule's globs match, and a heading listed twice in one rule. With several
   problems, the message lists each.
4. The renderer checks each page, for each rule in order: the first listed heading the page lacks gives "missing", and
   with all present, the first consecutive listed pair whose second heading first appears before the first gives "out of
   order". Each message names the page, the heading, the rule's index and the configuration file, and a "missing"
   message names the `except` that adds the page to the rule's exceptions.
5. The rules are part of the Markdown processor's configuration, so a changed rule makes Astro render, and check, a
   page again. A page added while `npm run dev` runs is checked from the server's next start.

## Options considered

- **A check in each library's gate.** Rejected: it duplicates the Markdown parser, and every library writes its own.
- **A frontmatter key that opts a page out.** Rejected: the exception sits in the page, away from the rule that
  names it, and a stale one is never found.
- **A warning.** Rejected: a published page without the skeleton is the failure the rule exists to prevent.
- **Headings matched by anchor id.** Rejected: an id hides the text a reader sees, and two texts can share one id.
- **Rules in `site.config.json`, checked by the renderer** (chosen): the rule and its exceptions are in one file, and
  the renderer sees the headings the page has.

## Consequences

- A skeleton holds on every page it names, and a page added later is held to it.
- Changing a heading's text changes the rule in the same pull request, because the build fails until it does.
- Exceptions are listed, and one that names a page the rule does not match fails the build.
- A glob that matches no page fails the build, so a rule cannot be left behind by a renamed folder.
- A page added while the dev server runs is checked from its next start.
- A rule checks headings only, and not the content under them.

## References

- `src/headings/required-headings.mjs`, `src/library.mjs`, `astro.config.mjs`, `scripts/site.mjs`,
  `schema/site.config.schema.json`
- `test/headings.test.mjs`, `fixture/`
- [CONTRACT.md](../../CONTRACT.md): the configuration an author writes.
- [#33](https://github.com/NCodeGroup/docs/issues/33)
- [NCodeGroup/Buffers#82](https://github.com/NCodeGroup/Buffers/issues/82)
