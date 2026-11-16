# 1001. The toolchain lives in this repository, and a library calls it by one pinned commit

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** NCode Group

## Context

A documentation site built with Astro Starlight
([ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md)) depends on several hundred npm packages:
this repository's lockfile names 395 (counted 2026-11-15). Two facts make the place of that lockfile matter to a
library.

- A .NET library's release carries an SBOM exported from GitHub's dependency graph for its repository
  (project-template ADR-0139; `release-provenance.yml` in
  [NCodeGroup/Buffers](https://github.com/NCodeGroup/Buffers/blob/main/.github/workflows/release-provenance.yml),
  read 2026-11-15). The graph covers every manifest and lockfile in the repository, so a site's packages would be in
  the SBOM of a library whose package has two dependencies.
- OpenSSF Scorecard's Vulnerabilities check scans a repository recursively for lockfiles, development dependencies
  included, and scores 10 minus the number of open advisories (Scorecard 5.6.0, `clients/osv.go` and
  `checks/evaluation/vulnerabilities.go`, read 2026-11-15). The framework under the site draws about one batch of
  advisories a month (ADR-1000).

A library still has to build its own site, on its own pull requests, from pages that change with its code. On GitHub
a reusable workflow gives it that without a manifest. Three properties of reusable workflows shape how:

- In a called workflow the `github` context is the caller's, so a checkout with no `repository` takes the library.
- `job.workflow_repository` and `job.workflow_sha` name the repository and the commit of the workflow file that
  defines the running job, which for a called workflow is the reusable workflow's own. Both exist on github.com and
  not on GitHub Enterprise Server
  ([contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context), read
  2026-11-15).
- A called workflow can keep or reduce the permissions its caller grants, never raise them.

## Decision

**The whole toolchain lives in this repository. A library holds its content, its sample tests and one workflow that
calls `.github/workflows/site.yml` at a pinned commit, and never an npm manifest or lockfile.**

1. This repository holds everything that builds a site: the Starlight project, `package.json` and
   `package-lock.json`, the theme, the plugins, the shared components and the reusable workflow. A library holds the
   pages and `site.config.json` in its content folder, the tests that hold its samples, and the calling workflow.
   [CONTRACT.md](../../CONTRACT.md) is the interface between the two.
2. The library's workflow pins this repository by full commit SHA, with the release's version in a comment. That one
   pin selects the workflow, the packages and the theme together: the build job checks out
   `job.workflow_repository` at `job.workflow_sha` and installs what that commit's lockfile names, with
   `npm ci --ignore-scripts --omit=dev`.
3. Where the two properties are missing, the `toolchain-ref` input names the commit and the repository is
   `NCodeGroup/docs`. A run that has neither commit fails at its first step. It never falls back to a branch.
4. The workflow has two jobs, so the job that runs the site's packages and the library's pages holds no publishing
   permission.
   - `build` checks out the library and the toolchain, installs, builds and uploads the site. Its token has
     `contents: read` and `pages: read`.
   - `deploy` hands the uploaded artifact to GitHub Pages, in the `github-pages` environment, with `pages: write` and
     `id-token: write`. It checks out nothing and runs no code of the library or of the toolchain. It runs only when
     the caller asks and the run is on the caller's default branch.

   The top-level permissions are empty. The caller grants `contents: read`, `pages: write` and `id-token: write` on
   the calling job, which is the most the two jobs use.
5. No job restores or saves a cache: the workflow sets `cache-mode: none`, and `setup-node` gets
   `package-manager-cache: false`. Every build is a full build (`astro build --force`).
6. This repository publishes a release tag for each version (`release: tag+release` in `AGENTS.md`), because
   Dependabot in a library moves a pin by commit only to a commit a release tag names.

## Options considered

- **A Starlight project in a folder of each library.** Rejected: the lockfile puts the toolchain's packages in each
  library's SBOM and each of their advisories on its Scorecard, and every library repeats the same updates.
- **The toolchain as an npm package a library installs.** Rejected: the library still needs a manifest and a
  lockfile to install it.
- **A composite action.** Rejected: it runs inside one job of the caller, so the caller, not this repository, would
  have to split the build from the deployment and set each job's permissions.
- **A required input that names the toolchain's commit.** Rejected as the only way: the library would hold two
  copies of one commit, and Dependabot moves only the one in `uses:`. It stays as the fallback of item 3.
- **Checking out the toolchain's default branch.** Rejected: a site would be built with packages nobody pinned.
- **Restoring the npm cache.** Rejected. An earlier run's files could reach a published site, and a package the build
  runs on the default branch could save a cache entry that the library's other workflows restore. A cache also saves
  nothing: `npm ci` takes 5.0 s with an empty cache (measured 2026-11-15, npm 11.20.0).
- **One job.** Rejected: the token of the job that runs several hundred packages could then publish.
- **A reusable workflow in this repository, called at one pinned commit** (chosen).

## Consequences

- A library's dependency graph, its SBOM and its Scorecard hold nothing of the site. The npm advisories alert here,
  once.
- A change to the theme, the plugins or the packages reaches a library's site only when its pin moves, in a pull
  request that builds the site.
- A pull request in a library builds the site with a read-only token and keeps it as an artifact.
- A library that needs a component or a package asks for it here. A page cannot import a package of the library's
  choosing.
- `cache-mode` is a workflow key on github.com since 2026-09-10
  ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#cache-mode),
  read 2026-11-15). actionlint 1.7.12, the newest release on 2026-11-15, reports it as an unexpected key and reports
  the two `job.workflow_*` properties as undefined, four reports in all; each is a false positive, because the linter
  is older than the features. zizmor 1.32.0 reports nothing for the workflow.
- An administrator sets up GitHub Pages once in each library: the source is GitHub Actions, and the `github-pages`
  environment deploys from the default branch alone (`README.md`).
- On GitHub Enterprise Server a library sets `toolchain-ref` and keeps it equal to its pin by hand.

## References

- `.github/workflows/site.yml`, `fixture/.github/workflows/docs.yml`, `README.md`, `CONTRACT.md`
- project-template [ADR-0008](project-template/0008-external-inputs-are-pinned-and-kept-current.md): external inputs
  are pinned exactly and kept current.
- project-template [ADR-0020](project-template/0020-github-projects-are-scored-by-openssf-scorecard.md): a GitHub
  project is scored by OpenSSF Scorecard.
- [Reusing workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [Control GitHub Actions cache access with cache-mode](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode)
- [zizmor: cache-poisoning](https://docs.zizmor.sh/audits/#cache-poisoning)
