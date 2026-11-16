# 1000. Library sites are built with Astro Starlight, core only

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** NCode Group

## Context

An NCode library's documentation site is narrative guides with C# samples, published as static files to GitHub Pages
under a base path such as `/Buffers/`. The site generator decides how much JavaScript a reader loads, how many
packages the build depends on, how often they move and how much code the project owns. One person maintains the
libraries, and every dependency is pinned exactly and moved by reviewed updates (project-template ADR-0008 and
ADR-0009), so each package and each release is a standing cost.

Two generators are measured in a prototype of the same five-page site: Astro Starlight and Fumadocs, which builds on
Next.js. The figures are from those prototypes, built on 2026-11-15 with the newest releases at least three days old
(`@astrojs/starlight` 0.42.11 on `astro` 7.4.11; `fumadocs-core` 16.19.0), unless a row names another source.

| | Astro Starlight | Fumadocs, as a Next.js static export |
| --- | --- | --- |
| Builds everything the site needs under a base path | Yes | Yes |
| JavaScript on a documentation page, compressed | 31 kB, of which 27 kB is the search, loaded when the browser is idle | 309 to 344 kB, in 15 to 20 scripts |
| Packages in the lockfile | 365 for the starter, 424 for the prototype | 370 to 436 |
| `node_modules` | 191 to 286 MB | 571 to 697 MB |
| Build of the five pages | 1.6 to 3 s | 8.9 to 14.2 s |
| Advisories against the framework underneath, 2026 up to 2026-11-15 | Astro: 35 ([its advisories](https://github.com/withastro/astro/security/advisories)) | Next.js: 44, five of them critical ([OSV](https://osv.dev)) |
| Releases | Astro: about 2.4 a week and two major versions in 2026; Starlight: a minor version that may break about every two months (npm registry) | Fumadocs: one every 2.1 days over 90 days, besides Next.js and React (npm registry) |
| What the project owns | Configuration, one stylesheet and about 600 lines of plugin code, comments included (this repository, counted 2026-11-15) | A React application: about 25 TypeScript files before any content |
| Including a named region of a C# file | Not built in | Built in |
| A site under a base path | Documented; a link an author writes gets no base path | Works; the framework's documentation does not cover it |

Nearly all of both frameworks' advisories are for server features that a static site does not run. A scanner matches
the lockfile, not the features in use, so each one alerts all the same until its fix is merged.

VitePress is assessed less than the other two: it has no prototype of the site, and its study is not finished. What
is known: its stable line is 1.6.4 and `2.0.0-alpha.21` is on the `next` tag (npm registry, read 2026-11-15); a theme
and its components are written in Vue; the sample reader of
[ADR-1002](1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md), behind a markdown-it plugin
of 18 lines, and the grammar patch of
[ADR-1004](1004-the-csharp-grammar-is-patched-at-build-time-for-extension-blocks.md) both run in a VitePress 1.6.4
build (tested 2026-11-15).

## Decision

**A library's site is built with Astro Starlight, and with Starlight's core alone: no community theme, and one add-on,
the link validator.**

1. The direct dependencies are `astro`, `@astrojs/starlight` and `starlight-links-validator`. `shiki` and
   `@astrojs/markdown-satteri` are also named in `package.json`, pinned to the versions Astro and Starlight resolve,
   because this repository's own code imports them: the grammar patch reads Shiki's C# grammar, and
   `astro.config.mjs` passes plugins to the Markdown processor.
2. The look comes from the NCode design system, not from a theme package: one stylesheet, `src/styles/theme.css`,
   maps Starlight's custom properties onto the vendored brand tokens, and three of Starlight's components are
   overridden (`src/components/overrides/`).
3. Starlight's three gaps for these sites are closed by code in this repository, each with a record of its own:
   including a compiled sample (ADR-1002), links under a base path
   ([ADR-1003](1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md)) and C# 14
   extension blocks (ADR-1004).
4. A package is added only for something every library's site needs and this repository cannot do in a few lines of
   its own.

## Options considered

- **Fumadocs.** Rejected. It includes regions of source files without a plugin and its default theme looks finished,
  but the site is static text and code, and it ships about ten times the JavaScript. Adopting it means owning a second
  application stack (TypeScript, React, Next.js, Tailwind CSS) whose packages release every two days.
- **VitePress.** Not chosen, on less evidence than the other two, as the Context says. It stays the fallback: the
  sample reader and the grammar patch are known to run on it.
- **DocFX.** Rejected: it does not render C# 14 extension blocks, the shape of the libraries' main APIs
  ([NCodeGroup/Buffers#56](https://github.com/NCodeGroup/Buffers/issues/56)).
- **A hosted documentation product**, such as Mintlify or GitBook. Rejected: the sites are published to each
  library's GitHub Pages.
- **Astro Starlight with community themes and plugins.** Rejected: each is one more package to pin, review and trust,
  and the look is the design system's either way.
- **Astro Starlight, core only** (chosen).

## Consequences

- A documentation page loads about a tenth of the JavaScript the measured alternative does, and no application
  framework.
- The project owns its plugin code and its theme: about 600 lines, comments included, in `src/snippets/`,
  `src/links/`, `src/highlighting/` and `src/route-data.ts` (counted 2026-11-15), and one stylesheet. A Starlight
  minor version may change the markup the theme styles, so an update is checked with the tests and with screenshots
  (`scripts/screenshots.mjs`).
- Astro sets the Node.js floor and raises it in patch releases: `astro` 7.4.11 requires Node.js 22.23.4 or later
  (its `package.json`, read 2026-11-15). `.node-version` is the one place the version is set (project-template
  ADR-0200).
- Astro 7 renders Markdown and MDX with Sätteri. The plugins in `src/snippets/` and `src/links/` are written for
  Sätteri's plugin interface, not for remark or rehype.
- Advisories against Astro arrive about once a month. They alert in this repository alone
  ([ADR-1001](1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md)).
- The choice is wrong when most Astro or Starlight releases need a change to the plugin code or break the theme.
  VitePress is then the first candidate to measure.

## References

- `package.json`, `astro.config.mjs`, `src/styles/theme.css`, `src/components/overrides/`
- [Astro Starlight](https://starlight.astro.build), [Fumadocs](https://fumadocs.dev),
  [VitePress](https://vitepress.dev)
- npm registry: [`astro`](https://www.npmjs.com/package/astro),
  [`@astrojs/starlight`](https://www.npmjs.com/package/@astrojs/starlight),
  [`vitepress`](https://www.npmjs.com/package/vitepress)
