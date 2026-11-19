# 1013. The site workflow loads each page in a browser and fails an element that leaves its content column

- **Status:** Accepted (amended by 1015)
- **Date:** 2026-11-18
- **Deciders:** NCode Group

## Context

NCode.Buffers (v0.13.0) shipped tables that spill over the "On this page" panel on four pages, and two components that
hide half their columns at every desktop width. Each was found by eye after the site was published
([#40](https://github.com/NCodeGroup/docs/issues/40), [#41](https://github.com/NCodeGroup/docs/issues/41)).

`test/browser.test.mjs` loads the fixture at 390 px only, so a desktop width is never measured. `site.yml` installs
with `--omit=dev`, so `playwright-core`, a development dependency, is absent from a library's build
([ADR-1005](1005-biome-lints-astro-components-without-formatting-them.md)).

GitHub's Ubuntu runner images install Google Chrome and set `CHROME_BIN` to `/usr/bin/google-chrome`
(actions/runner-images' `install-google-chrome.sh`, read 2026-11-18). A Chromium-based browser started with
`--remote-debugging-pipe` takes DevTools commands as NUL-separated JSON on file descriptors 3 and 4, with no port to
open. Trial 2026-11-18: the Playwright headless shell, Microsoft Edge and Chromium all answered that way, and 32 page
loads took about 3 s.

## Decision

**The site workflow runs `node scripts/site.mjs check` after it uploads the site. The command loads each built page in
the runner's Chromium-based browser at four widths, over the browser's DevTools pipe, and fails an element that leaves
its content column or hides content sideways. It adds no package.**

1. `scripts/site.mjs` has a `check` command. `src/layout/serve.mjs` serves the built site, `src/layout/browser.mjs`
   drives the browser over its pipe, and `src/layout/check.mjs` finds the browser, lists the pages, measures each one
   and words the message. The command reads the built site and writes nothing, so it neither locks the checkout nor
   mounts the library.
2. A page is loaded at 1440, 1280, 1024 and 390 px, each with a height of 900 px. The column is each
   `main .sl-container`. An element fails when its box is more than 1 px past the column's left or right edge, or when
   its `overflow-x` is not `visible` and `scrollWidth - clientWidth` is more than 1 px. A failing element is reported
   once, without its descendants.
3. The exemptions: a `display: contents` element is passed through to its children. An element 1 px or less wide or
   tall is skipped with its content. `.expressive-code` and `[data-scrolls]` must fit the column, but their content is
   not measured, so a code block and a component that scrolls sideways by design are allowed. The 404 page, unselected
   tab panels and closed `<details>` are not measured.
4. The browser is `--browser`, else `DOCS_BROWSER`, else `CHROME_BIN`, else the browser `npm run browser` installs,
   found through `playwright-core` when it is installed. A value with `/` or `\` is a path, resolved against the
   folder the command was typed in; one without is a command on `PATH`. The flags are `--headless`,
   `--no-sandbox`, `--hide-scrollbars`, `--remote-debugging-pipe`, `--user-data-dir=<a fresh temporary folder>`,
   `--no-first-run`, `--no-default-browser-check` and `about:blank`. `--no-sandbox` is what Playwright passes by
   default, and Chrome's sandbox does not start inside most runners and containers. The pages are the library's own,
   which the build job already ran in Node through Astro, with a read-only token, and they load from 127.0.0.1.
5. The workflow step runs after "Upload the site", so the site of a failing pull request can still be downloaded. Its
   failure fails the build job, which the deploy job needs, so a site that fails the check is not published.
6. The fixture has a page with a wide Markdown table (`reference/behaviour.mdx`) and a 64-cell `MemoryMap` component,
   marked `data-scrolls`, on `concepts/how-sealing-works.mdx`. `test/layout.test.mjs` passes the fixture, and reports
   the failures on broken copies of it: a component without `data-scrolls`, and a page that is too wide.

## Options considered

- **`playwright-core` as a dependency, with a browser download in the workflow.** Rejected: a package and a download
  in every library's build fail rule 4 of [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md),
  and the workflow's install omits development dependencies
  ([ADR-1005](1005-biome-lints-astro-components-without-formatting-them.md)).
- **An Astro integration inside `astro build`.** Rejected: every local build would need a browser.
- **Checking the HTML and CSS without a layout engine.** Rejected: only a browser knows where a box ends.
- **The browser's WebSocket endpoint.** Rejected: it needs a port, and the browser's output must be parsed to find it.
- **Checking only the fixture.** Rejected: a library's components are where the widest content was found.
- **The runner's browser over its pipe** (chosen): the workflow installs and downloads nothing, and the check runs on
  the library's own pages.

## Consequences

- A library's pull request fails on content wider than its column, and `npm run site '--' check <library folder>`
  shows the same problems locally.
- Each page loads four times.
- The browser follows the runner image's version, not a pin.
- A runner without Chrome or `CHROME_BIN` fails the step, and the message says how to name a browser.
- Unselected tab panels, closed `<details>` and the 404 page are not measured.
- A tab list that scrolls sideways on a phone fails the check.

## References

- `scripts/site.mjs`, `src/layout/`, `.github/workflows/site.yml`, `test/layout.test.mjs`
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): a package is added only when every
  library's site needs it.
- [ADR-1001](1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md): the workflow
  runs the toolchain at the commit a library pins.
- [ADR-1005](1005-biome-lints-astro-components-without-formatting-them.md): the workflow installs without development
  dependencies.
- [ADR-1014](1014-a-markdown-table-wraps-its-cells-to-fit-the-content-column-and-scrolls-inside-it-when-it-cannot.md):
  the table wrapper the check reports when it scrolls.
- [#41](https://github.com/NCodeGroup/docs/issues/41), NCodeGroup/Buffers
