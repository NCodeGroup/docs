# 1019. The toolchain ships the Pitfalls layout, and CONTRACT.md gives the calm-reading guidance

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NCode Group

## Context

NCodeGroup/Buffers#114 and #118 calmed a busy site across 31 pages. Every library's site faces the same choices, and
every library's guides have pitfalls ([#60](https://github.com/NCodeGroup/docs/issues/60)).

[ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md) adds a package to the toolchain only for what
every library's site needs. A pitfalls list is such a thing, and the guidance that keeps a page calm is one document
for every library.

## Decision

**The toolchain ships `Pitfalls`, and `CONTRACT.md` section 7 gives the calm-reading guidance.**

1. `Pitfalls` is in `@ncodegroup/docs/components`. It is a `div.ncode-pitfalls` around a Markdown list that the page
   writes, and `src/styles/theme.css` section 3 lays it out.
2. The labels stay italic, in the secondary text colour, as the guidance says, where Buffers' copy draws them semibold
   and upright.
3. `CONTRACT.md` section 7, "Calm reading", gives six rules: no page-kind plate, no "You'll use …" line under a guide's
   title, a short sidebar, pitfalls as a list, italic run-in labels, and evidence marks inline.
4. The examples in `CONTRACT.md` and `README.md` point at Buffers v5.3.2.

## Options considered

- **Guidance only.** Each library copies Buffers' `Pitfalls.astro`. Rejected: copies drift, and the labels look
  different from site to site.
- **Ship `Pitfalls`** (chosen): one layout for every library, and a change to it reaches every site with the toolchain.
- **Ship `Proof` too.** Rejected: it reads Buffers' `evidence.json`, which no other library has.

## Consequences

- A library imports `Pitfalls` instead of keeping a copy.
- The look of the labels is the toolchain's.
- `Proof` stays in Buffers; the guidance describes how evidence marks read, and a library draws its own.

## References

- `src/components/Pitfalls.astro`, `src/styles/theme.css`, `test/browser.test.mjs`
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): what the toolchain ships.
- [#60](https://github.com/NCodeGroup/docs/issues/60)
