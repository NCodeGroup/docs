# Architecture Decision Records

How NCode Docs records its decisions: one short Markdown file per decision, kept in this folder and changed in
the same pull request as the code it explains.

## When to Write One

Write a record for a non-obvious choice that someone would otherwise question again: a design with real alternatives,
a trade-off that looks wrong without its reasons, or a departure from the project template. The conventions themselves
go in `AGENTS.md` or the instruction files it lists; a record explains why a convention is what it is.
`/analyze-decision` compares the options and writes one, in a worktree of its own, where it lands with the plan that
builds it. Work bigger than one plan starts as a design document in `docs/designs/`, from
[its template](../designs/_template.md), and each of its decisions becomes a record here when its phase lands.

## How to Write One

- Copy [0000-template.md](0000-template.md) to `NNNN-kebab-case-title.md`, starting from `1000`. Numbers below 1000
  are the project template's, in [project-template/](project-template/README.md), so an ADR number names one record
  across both folders. `.template/Test-AdrIndex.ps1` fails a new record numbered below 1000; records the project
  already had keep their numbers.
- Take a number no one else holds. Fetch first, then take the next number above both the highest record numbered 1000
  or more on `origin/<default branch>` and any record an open branch, pull request or worktree is writing. Check again
  after rebasing or merging the default branch, and when the number was taken meanwhile, renumber the file, its title,
  its index row and every link to it. Two records never share a number; `.template/Test-AdrIndex.ps1` fails when they
  do.
- Add the record to the index below, in the same change.

## Statuses

- `Proposed`: the decision is open.
- `Accepted`: the decision holds.
- `Deprecated`: the decision no longer applies, and nothing replaces it.
- `Superseded by NNNN`: a later record replaces it whole.

Never rewrite the decision of an accepted record; fixing a typo or a broken link is fine. A changed decision is a new
record, and the old record's status and index row say so. When the new record changes only part of the old one, the
old one stays `Accepted` with a note, "Accepted (amended by NNNN)", and the new one's index row says "(amends NNNN)".
The old record's text is not edited beyond its status line.

## What a Record Is

A record is a decision the project made, not an authority. Where an external standard or current security practice
governs, it wins: a record that conflicts with one is superseded to align with it, never cited to justify the
deviation.

## Writing Rules

- Write every section in the present tense, so it reads the same a year later: what is, and why. Avoid words that
  date it, such as "now", "new", "currently", "previously", "originally", "we decided to change" or "the first
  version"; the history belongs in the commit log and in the records a record supersedes.
- Give a volatile fact (a price, a quota, a limit, a supported version) its source and the date it was read, and mark
  an estimate as an estimate.
- Keep a record short, and link to the code, issues and records it depends on rather than restating them.

## The Template's Decisions

The project template's own decisions are in [project-template/](project-template/README.md). Template updates replace
that folder. To decide otherwise, write a record here that says "Supersedes: project-template ADR-NNNN" and list the
override in `AGENTS.md`.

## Index

One row per record of NCode Docs's own, numbered from 1000; an empty table means it has none. The template's
records are indexed in [project-template/](project-template/README.md).

| ADR | Decision | Status |
| --- | --- | --- |
| [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md) | Library sites are built with Astro Starlight, core only | Accepted |
| [ADR-1001](1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md) | The toolchain lives in this repository, and a library calls it by one pinned commit | Accepted |
| [ADR-1002](1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md) | A page includes a compiled sample by its key when the site is built | Accepted |
| [ADR-1003](1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md) | Links are written from the site root, and the build proves none leaves the base path | Accepted |
| [ADR-1004](1004-the-csharp-grammar-is-patched-at-build-time-for-extension-blocks.md) | The C# grammar is patched at build time for extension blocks | Accepted |
| [ADR-1005](1005-biome-lints-astro-components-without-formatting-them.md) | Biome lints the Astro components without formatting them | Accepted |
| [ADR-1006](1006-the-toolchain-renders-the-404-page-and-supplies-one-when-a-library-has-none.md) | The toolchain renders the 404 page, and supplies one when a library has none | Accepted |
| [ADR-1007](1007-a-markdown-table-stacks-on-a-phone-with-its-cells-labelled-when-the-site-is-built.md) | A Markdown table stacks on a phone, with its cells labelled when the site is built | Accepted (amended by 1014) |
| [ADR-1008](1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md) | The brand is vendored from an attested release, and the theme restyles only Starlight's markup (amends 1000) | Accepted (amended by 1009) |
| [ADR-1009](1009-brands-vendoring-script-is-vendored-and-pinned-in-the-brand-lock.md) | Brand's vendoring script is vendored and pinned in the brand lock (amends 1008) | Accepted |
| [ADR-1010](1010-a-page-shows-a-repository-file-or-the-lines-between-two-texts-of-it-when-the-site-is-built.md) | A page shows a repository file, or the lines between two texts of it, when the site is built | Accepted |
| [ADR-1011](1011-a-site-can-require-headings-on-the-pages-a-glob-names-and-the-build-fails-a-page-without-them.md) | A site can require headings on the pages a glob names, and the build fails a page without them | Accepted |
| [ADR-1012](1012-the-build-fails-a-library-component-that-reads-a-token-the-brand-does-not-offer.md) | The build fails a library component that reads a token the brand does not offer | Accepted |
| [ADR-1013](1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md) | The site workflow loads each page in a browser and fails an element that leaves its content column | Accepted (amended by 1015, 1018) |
| [ADR-1014](1014-a-markdown-table-wraps-its-cells-to-fit-the-content-column-and-scrolls-inside-it-when-it-cannot.md) | A Markdown table wraps its cells to fit the content column, and scrolls inside it when it cannot (amends 1007) | Accepted (amended by 1015) |
| [ADR-1015](1015-a-markdown-table-must-fit-its-content-column-and-the-layout-check-names-one-that-does-not.md) | A Markdown table must fit its content column, and the layout check names one that does not (amends 1013, 1014) | Accepted |
| [ADR-1016](1016-a-library-runs-the-toolchain-through-a-launcher-it-copies-which-finds-the-toolchain-beside-its-main-checkout.md) | A library runs the toolchain through a launcher it copies, which finds the toolchain beside its main checkout | Accepted |
| [ADR-1017](1017-each-site-command-runs-astro-in-a-folder-of-its-own-so-one-toolchain-checkout-builds-several-sites-at-once.md) | Each site command runs Astro in a folder of its own, so one toolchain checkout builds several sites at once | Accepted |
| [ADR-1018](1018-the-layout-check-fails-an-inline-component-that-stands-apart-from-its-sentence.md) | The layout check fails an inline component that stands apart from its sentence (amends 1013) | Accepted |
| [ADR-1019](1019-the-toolchain-ships-the-pitfalls-layout-and-contract-md-gives-the-calm-reading-guidance.md) | The toolchain ships the Pitfalls layout, and CONTRACT.md gives the calm-reading guidance | Accepted |
| [ADR-1020](1020-the-sidebar-the-page-and-the-page-index-stand-together-in-the-middle-of-a-wide-window-and-a-hero-with-no-image-is-one-column.md) | The sidebar, the page and the page index stand together in the middle of a wide window, and a hero with no image is one column | Accepted |
