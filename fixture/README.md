# NCode.Fixture

A stand-in for a library repository, for the documentation toolchain's own build and tests. It has what a library
keeps: pages and a site configuration in `docs/site/`, a component and images of its own beside them, sample regions
in `tests/`, and the workflow that calls the toolchain. It has no `package.json` and no lockfile, as no library does.

The fixture has `build/site.mjs`, the launcher a library copies into its `build/` folder to build and serve its site
from its main checkout or any worktree (README.md, Local preview).

The fixture also has build files at its root, `Directory.Build.props` and `BannedSymbols.txt`, that
`guides/ban-apis.mdx` includes, and its configuration requires a Checklist section on its guides `derive-a-key` and
`ban-apis`.

The component `docs/site/_components/Proof.astro` is an inline component marked `data-inline`, used on
`guides/derive-a-key.mdx` at the end of a sentence and in a captioned row of its own.

It also has `docs/site/_too-wide-table.md`, which is no page, since its name starts with an underscore: a Markdown
table too wide for the content column, which `test/layout.test.mjs` copies into a page to prove that the layout check
fails it.
