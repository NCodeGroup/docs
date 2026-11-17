# NCode Docs

[![CI](https://github.com/NCodeGroup/docs/actions/workflows/ci.yml/badge.svg)](https://github.com/NCodeGroup/docs/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/NCodeGroup/docs/badge)](https://scorecard.dev/viewer/?uri=github.com/NCodeGroup/docs)

[//]: # "Badges: once the project is registered at bestpractices.dev, record its number as docs/best-practices-criteria.md says, then add the OpenSSF Best Practices badge that page shows."

The shared documentation toolchain for NCode libraries: an [Astro Starlight](https://starlight.astro.build) project,
the NCode theme, the plugins that include compiled samples and keep links working under a base path, and the reusable
GitHub Actions workflow that builds a library's site and publishes it to that library's GitHub Pages.

A library repository holds its pages and nothing of the toolchain:

| In the library | In this repository |
| --- | --- |
| Pages (`.mdx`), `site.config.json` | The Starlight project, `package.json`, the lockfile |
| Its own components and images | The theme, the fonts, the shared components |
| Its sample tests | The sample and link plugins |
| A short workflow that calls it | The reusable workflow that does the work |

A library carries no npm manifest and no lockfile: the npm dependency graph lives here, once, and a library refers to
it by one pinned commit.
[ADR-1001](docs/decisions/1001-the-toolchain-lives-in-this-repository-and-a-library-calls-it-by-one-pinned-commit.md)
has the reasons.

## Adopting it in a library

1. **Add the content folder**, `docs/site/` by default, with a `site.config.json` and an `index.mdx`.
   [CONTRACT.md](CONTRACT.md) is the reference for both; [`fixture/`](fixture/) is a complete small example.
2. **Mark the samples** in the library's tests with `// begin-snippet: Key` and `// end-snippet`
   ([Samples](#samples)).
3. **Add the caller workflow** ([The caller workflow](#the-caller-workflow)).
4. **Have an administrator set up GitHub Pages once** ([One-time setup](#one-time-setup)).
5. **Tell Dependabot about the pin**: the `github-actions` entry of the library's `.github/dependabot.yml` already
   covers workflow files, so the pinned commit moves with each release of this repository.
6. Add `*.mdx` to whatever the library's own gate checks for line endings and encoding. Nothing is built inside the
   library, so its `.gitignore` needs no new line.

### Content layout

```text
docs/site/
  site.config.json             the site's settings
  index.mdx                    the landing page
  quick-start.mdx              /quick-start/
  guides/derive-a-key.mdx      /guides/derive-a-key/
  _components/Diagram.astro    the library's own components
  _assets/lifecycle.png        the library's own images
tests/**/*.cs                  the files that hold sample regions
.github/workflows/docs.yml     the caller workflow
```

### Configuration

`docs/site/site.config.json`, checked against [`schema/site.config.schema.json`](schema/site.config.schema.json)
before anything is built:

```json
{
  "$schema": "https://raw.githubusercontent.com/NCodeGroup/docs/main/schema/site.config.schema.json",
  "title": "NCode.Buffers",
  "description": "One sentence about the library.",
  "product": "Buffers",
  "version": "v5",
  "repository": { "url": "https://github.com/NCodeGroup/Buffers", "branch": "main" },
  "site": { "url": "https://ncodegroup.github.io/Buffers" },
  "sidebar": [
    { "label": "Start here", "items": ["quick-start"] },
    { "label": "Guides", "items": [{ "autogenerate": { "directory": "guides" } }] }
  ]
}
```

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | The site's name: browser titles, search, link previews |
| `description` | Yes | One sentence about the library |
| `repository.url` | Yes | The repository, for the header's link and edit links |
| `repository.branch` | No | The default branch. Default `main` |
| `site.url` | Yes | The site's URL with its base path, used when the workflow passes none |
| `sidebar` | Yes | The navigation: groups in order |
| `product` | No | The name beside the mark. Default: `title` |
| `mark` | No | `ncode` (default) or `ncode-identity` |
| `version` | No | The label on the header's readout |
| `social` | No | The header's links. Default: GitHub |
| `samples` | No | Globs of the sample files, under the repository root. Default `["tests/**/*.cs"]` |
| `editLinks` | No | Default `true` |
| `lastUpdated` | No | Default `true` |

[CONTRACT.md](CONTRACT.md) has the full form of each key, `sidebar` items included.

### The caller workflow

`.github/workflows/docs.yml` in the library. It is
[`fixture/.github/workflows/docs.yml`](fixture/.github/workflows/docs.yml) with the pin replaced by a release's
commit:

```yaml
name: Documentation site

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened]
  workflow_dispatch:

permissions: {}

concurrency:
  group: docs-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != format('refs/heads/{0}', github.event.repository.default_branch) }}

jobs:
  site:
    permissions:
      contents: read # checks out this repository
      pages: write # reads the site's URL, and creates the deployment
      id-token: write # proves to GitHub Pages where the deployment comes from
    uses: NCodeGroup/docs/.github/workflows/site.yml@<full commit SHA> # <version>
    with:
      content-path: docs/site
      deploy: ${{ github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
```

Every pull request builds the site, so a page that does not build fails its check, and keeps the result for a week
as the `github-pages` artifact. Only a run on the default branch deploys. The three permissions are the most the
called jobs use: the build job reads, and the deploy job, which runs none of the library's code, writes.

| Input | Default | Meaning |
| --- | --- | --- |
| `content-path` | `docs/site` | The content folder, relative to the repository root |
| `deploy` | `false` | Whether to publish; only the default branch ever does |
| `toolchain-ref` | the pinned commit | The commit of this repository to build with |

The workflow also has one output, `page-url`: the URL of the published site, empty when the run did not deploy.

The workflow builds with this repository at the same commit the `uses:` line pins, which it reads from
`job.workflow_repository` and `job.workflow_sha`. `toolchain-ref` is for a host where those are missing: a run that
knows no commit stops at its first step and says so. Deployments run one at a time, in the workflow's own concurrency
group, whatever the caller's `concurrency` says.

### One-time setup

By a repository administrator, before the workflow's first run on the default branch:

1. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
2. Same page: **Enforce HTTPS** checked.
3. **Settings > Environments > github-pages > Deployment branches and tags: Selected branches and tags**, with one
   rule, the default branch. Leave required reviewers and the wait timer off.

A pull request build needs none of it.

## Writing a page

A page is an `.mdx` file with a `title`. The rest is in [CONTRACT.md](CONTRACT.md); the three rules that matter most:

### Samples

A page never holds a copy of code that must compile. It names a region of a compiled test, and the build fills the
block:

````mdx
```cs snippet=QuickStart title="Signatures.cs" {4}
```
````

```cs
// begin-snippet: QuickStart
using var keyOwner = BufferFactory.Rent(32, isSensitive: true, out Span<byte> key);
// end-snippet
```

A key no sample file defines, a key defined twice, a region never closed and a malformed marker each fail the build,
naming the page or the sample file, and the key. The language comes first in the fence, and the key has no quotes:
`cs snippet=Key`.

### Links

Write internal links from the site's root, with a trailing slash, and never with the base path:
`[derive a key](/guides/derive-a-key/)`. The build adds the base path, so the page works under `/Buffers/` and at the
root of a custom domain. A broken link, a relative link, a link written with the base path, and a link the build
could not put the base path on each fail the build, in a page, in its frontmatter and in the sidebar.

### Components

```mdx
import { Steps, Tabs, TabItem, Status } from '@ncodegroup/docs/components';
import Diagram from '@site/components/Diagram.astro';
import lifecycle from '@site/assets/lifecycle.png';
```

`@ncodegroup/docs/components` is Starlight's components and this toolchain's own; `@site/…` is the library's
`_components/` and `_assets/`. A page imports from nowhere else.

## Local preview

With both repositories cloned side by side, from this repository's folder:

```shell
npm ci --ignore-scripts
npm run dev -- ../Buffers
```

That serves the library's site at `http://localhost:4321/<base path>/` and follows edits to its pages and to its
sample files. `npm run preview -- ../Buffers` builds the site as CI does and serves the result, with the search
working. Both take `--content <path>` for a content folder other than `docs/site`, and `--port <number>`. From the
library's folder the same commands are `npm --prefix ../docs run dev -- .`. Nothing is written to the library.

`npm run site -- build ../Buffers --out <folder>` builds without serving.

## Development

Run from the repository root in PowerShell 7:

| Task | Command |
|---|---|
| Install | `npm ci --ignore-scripts` |
| Build | `npm run build` |
| Install the test browser | `npm run browser` |
| Test | `npm run test` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| Check the coverage | `./.template/Test-Coverage.ps1` |
| Check the file headers | `./.template/Test-FileHeaders.ps1` |

`npm run build` builds [`fixture/`](fixture/), a stand-in library, into `dist/`. `npm run test` builds the fixture
under `/Fixture/` and at a domain's root, breaks a copy of it in each way a sample or a link can be wrong, checks the
vendored brand files against their lock, and loads the built site in a browser.

`npm run lint` checks the code with Biome, as CI does before it builds, and `npm run format` applies Biome's
formatting and safe fixes; `biome.json` holds the rules.

`npm run test` also writes the coverage of the toolchain's code to `lcov.info`, and `./.template/Test-Coverage.ps1`
fails below 90% of its statements or 80% of its branches. CI runs it after the tests, and a release waits for it.

`./.template/Test-FileHeaders.ps1` checks that each JavaScript and TypeScript file starts with the copyright line and
the `SPDX-License-Identifier: Apache-2.0` line, as CI does, and `-Fix` adds them; [CONTRIBUTING.md](CONTRIBUTING.md)
says where the lines go in the files it skips: Astro components, stylesheets and `.d.ts` files.

The browser is the headless Chromium that the locked `playwright-core` drives. `npm run browser` downloads it, once
for each version of `playwright-core`; on Linux, `npm run browser -- --with-deps` also installs the system libraries
it needs. Where the browser is not installed the browser check is skipped and says so. `DOCS_REQUIRE_BROWSER=1` makes
that a failure, and CI sets it.

Node.js is the version `.node-version` names, with npm 11.10 or later: `.npmrc` sets `engine-strict`, so an older npm
stops at `npm ci` instead of ignoring the release-age rule. Where the machine's npm is older, run the install
through a newer one: `npx npm@11 ci --ignore-scripts`. `npm run` works with any npm.

### What is in this repository

| Path | What |
| --- | --- |
| `.github/workflows/site.yml` | The reusable workflow |
| `astro.config.mjs`, `ec.config.mjs` | The Starlight project, and its code blocks |
| `scripts/site.mjs` | Builds, serves or previews one library's site |
| `scripts/vendor-brand.mjs` | Vendors a release of NCodeGroup/brand, and checks the vendored files |
| `scripts/brand-watch.mjs`, `.github/workflows/brand-watch.yml` | Opens an issue each day NCodeGroup/brand has a release newer than the vendored one |
| `src/snippets/` | Reads sample regions and fills `snippet=` blocks |
| `src/links/` | Adds the base path to links; checks the built pages |
| `src/highlighting/` | C# 14 extension blocks for the C# grammar |
| `src/tables/` | Labels each Markdown table's cells with their column names, so a table stacks on a phone |
| `src/components/` | The shared components, and the three Starlight overrides |
| `src/styles/theme.css` | Starlight's markup, restyled with the brand tokens |
| `vendor/brand/` | The brand's tokens, fonts, Starlight mapping, syntax theme and marks, vendored from a release |
| `schema/site.config.schema.json` | The site configuration's schema |
| `fixture/` | A stand-in library: what `npm run build` builds and the tests check |
| `test/` | The tests, for Node's own test runner |
| `biome.json` | Biome's formatter and linter rules |
| `CONTRACT.md` | What a library holds, and what the build does with it |

### The theme

The look is NCode's design system, Instrument, from [NCodeGroup/brand](https://github.com/NCodeGroup/brand).
`vendor/brand/` holds the files `vendor/brand/brand.lock.json` names from one of its releases, in the release's own
folders: the tokens, the fonts, `css/starlight.css`, which sets Starlight's own properties from the tokens, the code
blocks' syntax theme, the marks and the favicons. They are never edited here: `npm run check:vendor`, which the tests
run, fails when a file differs from the SHA-256 the lock pins. `src/styles/theme.css` restyles Starlight's markup and
`ec.config.mjs` frames the code blocks, both with the brand's public tokens alone: its type roles, with running text in
the `reading` role on the `--nc-measure` column, its colour roles and its measures, and the Starlight properties
`css/starlight.css` sets. Neither states a colour of its own or reads a step of a colour ramp or of the type scale,
which a brand release may change, and the tests fail when either reads such a step or a custom property no vendored
stylesheet defines
([ADR-1008](docs/decisions/1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md)).

### Updating and releasing

- **Packages.** Exact versions in `package.json`, and each at least three days old when it is taken: `.npmrc` sets
  `min-release-age=3`, and Dependabot's cooldown says the same. `npm install <package>@<version>` for a version
  younger than that stops at once, also with `--force`, with `npm error code ETARGET` and
  `No matching version found for <package>@<version> with a date before <date>`, where `<date>` is three days ago.
  The version exists, whatever the error's next line says: npm takes it once it is three days old, so wait until
  then, or take the newest version npm offers. `shiki` and `@astrojs/markdown-satteri` are pinned to the versions
  Astro and Starlight resolve, so they move together with them in one pull request.
- **The brand.** `npm run update:brand -- <version>` vendors another release of NCodeGroup/brand. Dependabot can't see
  vendored files, so the brand-watch workflow, `.github/workflows/brand-watch.yml`, checks NCodeGroup/brand every day:
  while the lock pins an older release than the newest, it keeps one open issue labeled `brand-update`, "Update the
  brand to <version>", with the release's links and these steps, and closes it once the lock pins the newest release.
  `npm run watch:brand -- --dry-run` shows what it would do. The update needs the GitHub CLI, signed in, and writes the
  files only once `gh attestation verify` proves the release's archive was built by brand's publish workflow for its
  tag. A brand release is taken when it is published, without the packages' three-day wait
  ([ADR-1008](docs/decisions/1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md)).
  When the release changes `vendoring/vendor-brand.mjs`, copy it over `scripts/vendor-brand.mjs` and run
  `./.template/Test-FileHeaders.ps1 -Fix`. Then `npm run build`, `npm run test` and `node scripts/screenshots.mjs`: a
  release that renames or removes a token the theme reads fails the tests.
- **Checking an update.** `npm ci --ignore-scripts`, `npm run build`, `npm run browser` and `npm run test`, then the
  screenshots: Starlight is 0.x and a minor release may change the markup the theme styles.
- **Releasing.** A release is a version tag on the default branch, with a GitHub release:
  `.github/workflows/tag-release.yml` makes both when a pull request whose description has a `Release: <version>` line
  merges. Libraries pin the tag's commit SHA in their caller workflow, with the version in a comment, and Dependabot
  proposes the next one in each library. A library's site changes only when that pull request merges.
- **A change a library needs** (a shared component, a configuration key) is made here, released, and then taken by the
  library through its pin. Nothing library-specific is committed here.

## AI-Assisted Workflow

This repository is set up for plan-then-execute coding: Claude Opus plans each change into `PLAN.md`, a cheaper model executes it one verified step at a time, and any step that needs a decision goes back to Opus. [AGENTS.md](AGENTS.md) is the index of the instructions every agent follows.

Work in Claude Code or GitHub Copilot, and switch whenever you like: both have the same commands, and `PLAN.md` is the only state they share, so one can plan and the other execute. Each bills its own subscription.

| Tool | Plan | Execute | Re-plan one step | Review | Land, then finish |
|---|---|---|---|---|---|
| Claude Code | `/plan-feature <what to build>` (or `/plan-bugfix`, `/plan-refactor`, `/plan-tests`, …), or `/plan-issue #42` for an issue, then review `PLAN.md` | `/orchestrate-plan` | `/replan-step N` | `/review-plan-diff` | `/ship-plan`, then `/finish-plan` |
| Copilot Chat in VS Code | The Copilot Planner agent on Opus, or `/plan-feature` or `/plan-issue #42` | Run all steps with subagents, or Execute next step | Re-plan with the planner | Review the work | `/ship-plan`, then `/finish-plan` |
| Copilot CLI | `copilot --model claude-opus-5.5`, then `/plan-feature` or `/plan-issue #42` | `/orchestrate-plan` | `/replan-step N` | `/review-plan-diff` | `/ship-plan`, then `/finish-plan` |

In Claude Code, plan in Accept edits mode and execute in Auto.

Each plan gets its own git worktree under `.claude/worktrees/`, in every tool, so several sessions can work on different plans at once.

The workflow files come from a Copier template, which owns them: never edit `.template/`, `.template-version`, `.githooks/pre-push`, `.github/instructions/project-template.instructions.md`, `.copier-answers.yml`, `CLAUDE.md` or the commands, agents and skills the template generates. To change how agents work here, edit `AGENTS.md` or a file it lists. To pull in template improvements, run `.\.template\Update-Project.ps1`: it updates itself, replaces the template's files, merges template changes into the shared settings files, and never touches `AGENTS.md` or this README. To plan the update first, with a trial run, the project files that need changing and the checks, run `/plan-template-update`. The weekly `template-update` workflow opens an issue, labeled `template-update`, when a newer template version is out, and closes it once the project has updated; `/plan-issue` plans it.

## Project

- [CONTRACT.md](CONTRACT.md): what a library holds for its site, and what the build does with it.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to set up, build, test and propose a change.
- [SECURITY.md](SECURITY.md): how to report a vulnerability privately.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [GOVERNANCE.md](GOVERNANCE.md) and [ROADMAP.md](ROADMAP.md): how we work together, who decides, and where the project is going.
- [docs/architecture.md](docs/architecture.md) and [docs/assurance-case.md](docs/assurance-case.md): how the project is built, and why it meets its security requirements.
- [docs/decisions/](docs/decisions/README.md): the decisions behind the design, the project's and the template's.
- [CHANGELOG.md](CHANGELOG.md): in the Keep a Changelog format, what the product does until its first stable release, while `AGENTS.md`'s Landing section says `pre-release: untracked`, and what changed in each release from then on.
- [LICENSE.txt](LICENSE.txt): the license.

## License

NCode Docs is licensed under the [Apache License 2.0](LICENSE.txt). The files in `vendor/brand/` come from
[NCodeGroup/brand](https://github.com/NCodeGroup/brand) under the same license, except the fonts in
`vendor/brand/fonts/`, licensed under the SIL Open Font License 1.1 with their license files beside them, and the names
NCode, NCode Group and NCode Identity and the marks in `vendor/brand/logo/`: trademarks of NCode Group, whose artwork is
copyright NCode Group, all rights reserved, and which the Apache License 2.0 does not cover.
[vendor/brand/TRADEMARKS.md](vendor/brand/TRADEMARKS.md) says how they may be used.
