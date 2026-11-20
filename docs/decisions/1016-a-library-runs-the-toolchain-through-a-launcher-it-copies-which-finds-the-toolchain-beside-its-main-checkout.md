# 1016. A library runs the toolchain through a launcher it copies, which finds the toolchain beside its main checkout

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NCode Group

## Context

A library's plans run in git worktrees under `.claude/worktrees/<name>/`. The command
`npm --prefix ../docs run dev '--' .` names `.claude/worktrees/docs` from one of them, so npm fails with ENOENT and
every Done-when that builds the site fails ([#57](https://github.com/NCodeGroup/docs/issues/57)). NCode.Buffers wrote
its own `build/site.ps1` to get around it (NCodeGroup/Buffers#118). PowerShell also drops a bare `--` before npm's
shim, so the command differs between PowerShell and bash.

A library has one place that is the same in the main checkout and in every worktree: the common Git folder, which is
the main checkout's `.git`. The toolchain is cloned beside the main checkout.

## Decision

**A library copies `fixture/build/site.mjs` into its `build/` folder and runs `node build/site.mjs <command>`. The
launcher finds the toolchain beside the library's main checkout and runs `scripts/site.mjs` for the checkout it is
in.**

1. The library is the folder above the launcher's `build/` folder.
2. The toolchain is the folder named by `--toolchain <folder>`, else by `DOCS_TOOLCHAIN`, else `docs` beside the main
   checkout, found with `git rev-parse --path-format=absolute --git-common-dir` run in the library.
3. The launcher runs `node` with the toolchain's `scripts/site.mjs`, the command, the library and the remaining
   arguments, and passes the exit code on. It runs `node`, never npm, so no `--` separator passes through a shell.
4. A library that is in no git repository, or a toolchain folder with no `scripts/site.mjs`, exits 1 with a message that
   names the folder and says how to name the toolchain.
5. The command line of `scripts/site.mjs` (`CONTRACT.md` section 9) is the interface between the launcher and the
   toolchain.

## Options considered

- **A documented one-line command only.** Each library re-invents it, and PowerShell and bash differ in how they pass
  `--` to npm. Rejected.
- **A PowerShell script such as Buffers' `build/site.ps1`.** A second runtime in a library that already needs Node.js
  for `site.mjs`, and project-template ADR-0021 puts Node.js first. Rejected.
- **A package run with `npx`.** A library has no manifest (ADR-1001), and `npx` can fetch code the library did not
  pin. Rejected.
- **The Node.js launcher copied from the fixture** (chosen): one file, one runtime, the same command in every shell and
  every checkout, and the fixture, the stand-in library, holds it as it holds the caller workflow libraries copy.

## Consequences

- A copy can fall behind the fixture's launcher and is copied again to take a change.
- `scripts/site.mjs`'s command line is the interface: a change to it is a change to every library's launcher.
- A library laid out otherwise, such as in a submodule, names its toolchain with `--toolchain` or `DOCS_TOOLCHAIN`.

## References

- `fixture/build/site.mjs`, `test/launcher.test.mjs`
- [ADR-1001](1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md): the
  toolchain's place and how a library calls it.
- [Project-template ADR-0021](project-template/0021-tooling-is-written-in-nodejs-then-go-then-powershell.md): Node.js
  first.
- [#57](https://github.com/NCodeGroup/docs/issues/57)
