# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until the first stable release, the [Unreleased] section describes the product as it is, not its changes.

## [Unreleased]

### Added

- A reusable workflow, `.github/workflows/site.yml`, builds a library's documentation site from the library's content folder and publishes it to that library's GitHub Pages from its default branch. A library calls it at one pinned commit and holds no npm manifest or lockfile. Its inputs are `content-path`, `deploy` and `toolchain-ref`, and its output is `page-url`. A pull request builds the site and keeps it as an artifact for a week ([ADR-1001](docs/decisions/1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md)).
- Sites are built with Astro Starlight and the NCode theme: vendored brand tokens, fonts and marks, the shared components `Status`, `Readout` and `Braces`, a search, and a 404 page ([ADR-1000](docs/decisions/1000-library-sites-are-built-with-astro-starlight-core-only.md)).
- A library configures its site in `site.config.json`: title, description, repository, URL, navigation, mark, version label, links and sample globs. The file is checked against `schema/site.config.schema.json` before anything is built, and a wrong one stops the build with a message that names the key. A sample glob names files under the repository root: each file it matches is checked by its real path, with every symbolic link on its path followed, and one that a pattern or a symbolic link puts outside the repository stops the build too, as does a symbolic link that leads nowhere or around in a loop.
- A page includes a compiled sample by its key, `cs snippet=Key`, from a region of the library's tests marked `// begin-snippet: Key` and `// end-snippet`. An unknown key, a key defined twice, a region that is never closed, a malformed marker and a block with code of its own each stop the build ([ADR-1002](docs/decisions/1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md)).
- An author writes links from the site's root, and the build adds the base path, so one page works under `/<repository>/` and at the root of a custom domain. A broken link, a relative link, a link written with the base path and a built page that links outside the base path each stop the build ([ADR-1003](docs/decisions/1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md)).
- C# 14 extension blocks are highlighted as declarations ([ADR-1004](docs/decisions/1004-the-csharp-grammar-is-patched-at-build-time-for-extension-blocks.md)).
- Each page links to its source in the library's repository and shows the date of the last commit that changed it. Where the library is in a repository whose history git cannot read, the pages show no date and the build warns, with git's message, as an annotation in GitHub Actions.
- `scripts/site.mjs` builds, serves or previews a library's site from a clone beside it: `npm run dev -- <library folder>` follows edits to pages and sample files, and writes nothing to the library.
- `CONTRACT.md` states what a library holds for its site and what the build does with it, and `fixture/` is a complete small library that the tests build.

### Security

- The workflow's job that runs the site's packages and a library's pages has a read-only token. A second job, which checks out nothing and runs no code of the library or the toolchain, deploys, and only from the library's default branch ([ADR-1001](docs/decisions/1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md)).
- No job of the workflow restores or saves a cache, and every build is a full build.
- Packages are pinned to exact versions, each at least three days old when it is taken, and installed from the lockfile without install scripts.
- A built site loads its fonts, scripts and styles from its own origin.
- CI fails when the tests cover less than 90% of the statements or 80% of the branches of the toolchain's code, which `npm run test` measures and `./.template/Test-Coverage.ps1` checks, so a release is tagged only once that check passes again on its commit ([#11](https://github.com/NCodeGroup/docs/issues/11), [ADR-0026](docs/decisions/project-template/0026-tests-gate-coverage-at-the-gold-thresholds-and-a-release-waits-for-them.md)).
- A release is tagged only once CI passes again on its commit, and in this public repository its tag is signed with gitsign through Sigstore's keyless signing. Releases are immutable, and `SECURITY.md` says how to verify a release and its tag ([#7](https://github.com/NCodeGroup/docs/issues/7), [ADR-0026](docs/decisions/project-template/0026-tests-gate-coverage-at-the-gold-thresholds-and-a-release-waits-for-them.md), [ADR-0028](docs/decisions/project-template/0028-github-releases-are-immutable-and-their-tags-signed.md)).
- NCode Review approves a pull request whose review leaves no blocker or should-fix finding open, and a push dismisses that approval ([#7](https://github.com/NCodeGroup/docs/issues/7), [ADR-0022](docs/decisions/project-template/0022-ncode-reviews-approval-gates-the-merge.md)).
