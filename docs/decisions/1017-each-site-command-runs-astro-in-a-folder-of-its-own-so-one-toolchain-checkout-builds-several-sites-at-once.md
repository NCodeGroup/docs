# 1017. Each site command runs Astro in a folder of its own, so one toolchain checkout builds several sites at once

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NCode Group

## Context

Plans run in parallel worktrees and sessions, and a dev server can be left running, so one checkout of the toolchain
has to build and serve several sites at once
([#58](https://github.com/NCodeGroup/docs/issues/58),
[NCodeGroup/Buffers#114](https://github.com/NCodeGroup/Buffers/pull/114) and
[NCodeGroup/Buffers#118](https://github.com/NCodeGroup/Buffers/pull/118)).

Astro keeps per-project state in its root's `.astro/` folder: the content modules, the asset imports and the dev data
store. No setting moves that folder (`astro/dist/core/config/settings.js`, Astro 7.4.11). Starlight and
starlight-links-validator 0.27.0 find pages at `<srcDir>/content/docs`. Two runs cannot share a root.

## Decision

**Each `build`, `dev` and `preview` makes a folder of its own under `.runs/` in the toolchain and runs Astro in it, so
one checkout of the toolchain builds and serves several sites at once.**

1. A run's folder is `.runs/<pid>-<suffix>/`. It holds re-exports of `ec.config.mjs` and `src/content.config.ts`, a
   copy of `src/content/i18n/`, and the library's content folder mounted at `src/content/docs/`.
2. Astro's root and working folder is the run's folder, and `--config` names `astro.config.mjs` relative to it.
   `astro.config.mjs` names every toolchain file by its full path, and the 404 page is injected as a route from the
   toolchain's `src/pages/404.astro`, because the run's folder has no `src/pages/`.
3. A run's folder is removed when its command ends. The next command removes a folder whose process is gone.
4. `build` and `preview` lock their output folder, `.runs/out-<hash>.lock`. A second command that writes the same
   folder stops with a message that names the process and the library that hold it, and says to wait, stop it, or name
   another folder with `--out`. A lock whose process is gone is taken over.
5. The output folder may be anywhere, including beside the toolchain.

## Options considered

- **Wait for the checkout's lock with a timeout.** Still one command at a time, and a dev server holds the lock until
  it is stopped. Rejected.
- **A second toolchain checkout for each parallel job.** An install for each, and each library's wrapper has to pick
  one. Rejected.
- **A mount folder for each run in one Astro root.** Runs overwrite each other's `.astro/` modules. Rejected.
- **A folder for each run** (chosen): nothing is shared but the toolchain's own files, so the only conflict left is two
  commands that write one output folder.

## Consequences

- Each command starts with empty Astro and Vite caches, so a dev server starts a little slower and
  every build is a full build (`--force`).
- A killed command leaves its folder until the next command removes it.
- Messages name files under `.runs/<run>/src/content/docs/`; `CONTRACT.md` maps such a path to the library's file.

## References

- `src/runs.mjs`, `scripts/site.mjs`, `astro.config.mjs`, `test/runs.test.mjs`
- [ADR-1001](1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md): the
  toolchain's place and how a library calls it.
- [ADR-1006](1006-the-toolchain-renders-the-404-page-and-supplies-one-when-a-library-has-none.md): the 404 page.
- [#58](https://github.com/NCodeGroup/docs/issues/58)
