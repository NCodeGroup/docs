# Architecture

How NCode Docs is built. [assurance-case.md](assurance-case.md) explains why the design meets its security
requirements.

## Components

A library's `.github/workflows/docs.yml` calls `.github/workflows/site.yml` at a pinned commit of this repository. Its
build job checks out the library and the toolchain, installs the locked packages and runs `scripts/site.mjs`, which
copies the library's content folder into the toolchain and runs Astro. A maintainer runs the same script beside a clone
of a library, with `npm run dev` or `npm run site`.

```mermaid
flowchart LR
  caller["Library's docs.yml"] --> build["build job of site.yml"]
  build --> install["npm ci --ignore-scripts --omit=dev"] --> script["scripts/site.mjs"]
  local["npm run dev or npm run site"] --> script
  script --> astro["Astro and Starlight, with the toolchain's plugins"]
  astro --> artifact["github-pages artifact"]
  artifact --> deploy["deploy job of site.yml"] --> pages["The library's GitHub Pages"]
```

| Component | Role |
| --- | --- |
| Reusable workflow (`.github/workflows/site.yml`) | Two jobs: `build` checks out the library and the toolchain at the pinned commit, installs, builds and uploads the site; `deploy` hands the artifact to GitHub Pages, from the library's default branch only |
| Site script (`scripts/site.mjs`) | Checks its arguments, resolves the library, checks the samples, the `requiredHeadings` rules and the components' tokens before Astro starts, takes the checkout's lock, copies the content folder to `src/content/docs/`, with the toolchain's 404 page when the library has none, and runs `astro build --force`, `dev` or `preview`; for `check` it serves the built site and loads each page in a browser instead of running Astro |
| Library settings (`src/library.mjs`, `src/json-schema.mjs`, `schema/site.config.schema.json`) | Reads `DOCS_LIBRARY` and `DOCS_CONTENT`, checks `site.config.json` against the schema, resolves the sample globs to files inside the library, lists the pages (`listPages`, `pageSlug`), reads the commit the site is built from (`readCommit`), and dates each page with one `git log` |
| Astro project (`astro.config.mjs`, `src/integration.mjs`, `src/content.config.ts`, `src/pages/404.astro`) | Configures Starlight from the library's settings: the base path from `SITE_URL` or `site.url`, the Markdown plugins, the link checks, and the import aliases `@ncodegroup/docs/components`, `@site/components/` and `@site/assets/`; and renders the 404 page, the library's or the toolchain's, in place of Starlight's own 404 route ([ADR-1006](decisions/1006-the-toolchain-renders-the-404-page-and-supplies-one-when-a-library-has-none.md)) |
| Samples and repository files (`src/snippets/`, `src/includes/`) | Reads the regions of the sample files and fills each `snippet=Key` block, and reads the repository files pages name and fills each `file=` block with a link to its lines ([ADR-1002](decisions/1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md), [ADR-1010](decisions/1010-a-page-shows-a-repository-file-or-the-lines-between-two-texts-of-it-when-the-site-is-built.md)) |
| Required headings (`src/headings/`) | Checks the rules of `requiredHeadings` against the library's pages before Astro starts, and each rendered page's headings against them ([ADR-1011](decisions/1011-a-site-can-require-headings-on-the-pages-a-glob-names-and-the-build-fails-a-page-without-them.md)) |
| Component tokens (`src/brand/`) | Checks the brand tokens a library's components (`_components/`) read before Astro starts ([ADR-1012](decisions/1012-the-build-fails-a-library-component-that-reads-a-token-the-brand-does-not-offer.md)) |
| Links (`src/links/`, `starlight-links-validator`) | Adds the base path to the links an author writes, fails the build on a broken link, and reads every built page for a link outside the base path ([ADR-1003](decisions/1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md)) |
| Layout check (`src/layout/`) | Serves a built site under its base path, drives a Chromium-based browser over its DevTools pipe at 1440, 1280, 1024 and 390 px, and reports each element of a page's content column that leaves it or hides part of its content sideways ([ADR-1013](decisions/1013-the-site-workflow-loads-each-page-in-a-browser-and-fails-an-element-that-leaves-its-content-column.md)) |
| Route middleware (`src/route-data.ts`) | Adds the base path to frontmatter links, and sets each page's edit link and "last updated" date from the library's repository |
| Code blocks (`ec.config.mjs`, `src/highlighting/`) | Expressive Code's syntax theme, the brand's `syntax/instrument-screen.json`, a frame styled from the brand's public tokens, with an inserted or deleted line in its success or danger colours, and Shiki's C# grammar with two rules for C# 14 extension blocks ([ADR-1004](decisions/1004-the-csharp-grammar-is-patched-at-build-time-for-extension-blocks.md)) |
| Theme (`src/styles/theme.css`, `src/tables/`, `src/components/`, `vendor/brand/`) | The brand's tokens, fonts, Starlight mapping, syntax theme and marks, vendored from a release of NCodeGroup/brand ([ADR-1008](decisions/1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md)), the stylesheet that restyles Starlight's markup in the brand's type roles, with running text in the `reading` role on the brand's measure, and stacks a table on a phone, the Markdown plugin that labels each table cell with its column's name for that ([ADR-1007](decisions/1007-a-markdown-table-stacks-on-a-phone-with-its-cells-labelled-when-the-site-is-built.md)), the shared components and three Starlight overrides |
| Brand vendoring (`vendor/brand/vendoring/vendor-brand.mjs`, `vendor/brand/brand.lock.json`) | `npm run update:brand` writes the files the lock names, the script itself among them, from a release whose archive `gh attestation verify` proves; `npm run check:vendor` fails, with no network, when a vendored file differs from the SHA-256 the lock pins |
| Brand watch (`.github/workflows/brand-watch.yml`, `scripts/brand-watch.mjs`) | Every day, compares the release the lock pins with NCodeGroup/brand's newest release, keeps one open `brand-update` issue while the lock is behind, and closes it once the lock pins the newest release |
| Fixture and tests (`fixture/`, `test/`, `scripts/screenshots.mjs`) | A stand-in library that `npm run build` builds, the `node:test` suites that build it and broken copies of it, and screenshots to check a theme change |

## Design Rules

- A library holds its content only. The toolchain, its packages and the workflow live here, and one pinned commit
  selects them together
  ([ADR-1001](decisions/1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md));
  [CONTRACT.md](../CONTRACT.md) is the interface between the two.
- The job that runs the packages and a library's pages holds no write permission, and the job that deploys runs no code
  of the library or the toolchain
  ([ADR-1001](decisions/1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md)).
- No job restores or saves a cache, and every build is a full build
  ([ADR-1001](decisions/1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md),
  [ADR-1002](decisions/1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md)).
- A sample, an included file, a required heading, a component token or a link the build cannot place fails the build,
  never a warning, and the message names the file as its author knows it
  ([ADR-1002](decisions/1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md),
  [ADR-1010](decisions/1010-a-page-shows-a-repository-file-or-the-lines-between-two-texts-of-it-when-the-site-is-built.md),
  [ADR-1011](decisions/1011-a-site-can-require-headings-on-the-pages-a-glob-names-and-the-build-fails-a-page-without-them.md),
  [ADR-1012](decisions/1012-the-build-fails-a-library-component-that-reads-a-token-the-brand-does-not-offer.md),
  [ADR-1003](decisions/1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md)).
- Sites use Starlight's core with one add-on, the link validator, and a package is added only for what every library's
  site needs
  ([ADR-1000](decisions/1000-library-sites-are-built-with-astro-starlight-core-only.md)). Biome is a devDependency,
  which the workflow's install leaves out
  ([ADR-1005](decisions/1005-biome-lints-astro-components-without-formatting-them.md)).
- The C# grammar patch steps aside when the grammar has a rule of its own for extension blocks, and stops the build
  when a rule it builds on is missing
  ([ADR-1004](decisions/1004-the-csharp-grammar-is-patched-at-build-time-for-extension-blocks.md)).
- The build writes nothing to the library: it reads a copy of the content folder, which git ignores and the next run
  replaces.
- Vendored files are never edited here: a release of NCodeGroup/brand replaces them whole. `src/styles/theme.css` and
  `ec.config.mjs` read only the brand's public tokens and the Starlight properties `css/starlight.css` sets, never a
  step of a colour ramp or of the type scale, and state no colour of their own.
- Decisions the design rests on are recorded in [decisions/](decisions/README.md).

## Build and Release

CI runs the project's commands on every pull request (`.github/workflows/ci.yml`). `AGENTS.md`'s Landing section sets
`release: tag+release`, so `.github/workflows/tag-release.yml` runs CI again on a release's commit, then tags and
publishes the release as its pull request merges, as
[ADR-0016](decisions/project-template/0016-releases-are-tagged-and-published-when-their-pull-request-merges.md) records.
