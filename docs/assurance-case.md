# Assurance Case

This page states NCode Docs's security requirements, the threats it considers, and why the design and the way it
is built meet them. [architecture.md](architecture.md) describes the components; [README.md](../README.md) is the
user-facing summary.

## Security Requirements

- **R1.** The job that runs the site's packages and a library's pages holds no write permission and no secret: its
  token has `contents: read` and `pages: read`, and neither checkout keeps its credentials.
- **R2.** Only a run on the library's default branch publishes, and the job that publishes runs no code of the library
  or the toolchain: `deploy` runs when the caller asks and the run is on the default branch, in the `github-pages`
  environment, checks out nothing and hands the build's artifact to GitHub Pages.
- **R3.** A site is built with the toolchain commit the library pinned and exactly the packages that commit's lockfile
  names: the toolchain is checked out at `toolchain-ref` when the caller sets it and otherwise at `job.workflow_sha`,
  with no fallback to a branch, `npm ci --ignore-scripts --omit=dev` installs the packages, and no job restores or
  saves a cache.
- **R4.** The build reads a library's sample files and the files its pages include only from inside its repository: the
  content path is a relative path without `..`, each sample file is checked by its real path with every symbolic link
  on it followed, no sample is read from `bin`, `obj`, `node_modules`, `TestResults` or `.git`, and an included file is
  named by a relative path without `.` or `..` segments, has a real path inside the repository that holds no `.git`
  segment, and is at most 1 MiB of UTF-8 text.
- **R5.** What the build cannot place stops it: a `site.config.json` the schema rejects, a sample that is wrong or
  missing, an include that is wrong, a page without a heading a `requiredHeadings` rule requires, a component that reads
  a token the brand does not offer, and a link that is broken, relative, written with the base path or left outside it
  ([ADR-1002](decisions/1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md),
  [ADR-1010](decisions/1010-a-page-shows-a-repository-file-or-the-lines-between-two-texts-of-it-when-the-site-is-built.md),
  [ADR-1011](decisions/1011-a-site-can-require-headings-on-the-pages-a-glob-names-and-the-build-fails-a-page-without-them.md),
  [ADR-1012](decisions/1012-the-build-fails-a-library-component-that-reads-a-token-the-brand-does-not-offer.md),
  [ADR-1003](decisions/1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md)).
- **R6.** A built site loads its fonts, scripts and styles from its own origin.

Users must not rely on the toolchain to check a library's pages: the build runs a page and a component as code and
publishes the HTML they write as written, so a library reviews its pages as it reviews its code. External links are
published unchecked. The content folder is read where its path leads, a symbolic link on that path included: like the
pages in it, it is the library's own to review. Where a library sets `toolchain-ref`, as it must where the
`job.workflow_*` properties are missing, such as on GitHub Enterprise Server, R3 holds only while it keeps that input
equal to its pin: the workflow checks the input out as given.

## Threat Model

The trust boundary is the build job. A library's pages, components, sample files and `site.config.json`, from a pull
request too, and the npm packages run or are read inside it, with the permissions of R1, and only the built artifact
crosses to the deploy job. A library's default branch is trusted as the library's own code. Out of scope: a
compromised GitHub or npm account, a maintainer with write access to a library or to this repository acting against
it, and a vulnerability in a dependency itself ([SECURITY.md](../SECURITY.md)).

| Threat | In scope | Countered by |
| --- | --- | --- |
| A pull request in a library, from a fork too, runs code in the build through a page or a component | Yes | R1: the build job's token only reads, and the job holds no secret; R2: a pull request's run never deploys |
| A pull request's build is published | Yes | R2: `deploy` runs only on the default branch, and the `github-pages` environment deploys only from that branch |
| A run leaves files in a cache that a publishing run restores | Yes | R3: `cache-mode: none`, and `package-manager-cache: false` for `setup-node` |
| A site is built with a toolchain or packages nobody pinned | Yes | R3: a run that knows no toolchain commit stops at its first step, and `npm ci` fails when `package.json` and the lockfile disagree |
| A new or compromised package release runs code when it is installed | Yes | R3: `--ignore-scripts`; `.npmrc`'s `min-release-age=3` and Dependabot's cooldown; every update is a reviewed pull request |
| An action a workflow uses changes under its tag | Yes | Every action is pinned by full commit SHA, which Dependabot moves |
| A workflow input injects a command into a step | Yes | `.github/workflows/site.yml` passes its inputs to the script through `env`, never into a command's text |
| A content path with `..`, a samples glob, a symbolic link on a sample file's path, or a `file=` path makes the build read a file outside the library | Yes | R4: `resolveLibrary` in `src/library.mjs`, and `resolveIncludedFile` in `src/includes/files.mjs` |
| A wrong sample or a broken link is published | Yes | R5 |
| A published site loads code or fonts from another origin, which can change after the build | Yes | R6: the fonts are vendored in `vendor/brand/fonts/`, and the tests check every built page and every request a browser makes |
| A vendored brand file is edited here and drifts from its release | Yes | `npm run check:vendor`, which the tests run, compares each file with the SHA-256 `vendor/brand/brand.lock.json` pins |
| A brand release's files are swapped, at its tag or on the way, before they are vendored | Yes | `npm run update:brand` writes nothing unless `gh attestation verify` proves that NCodeGroup/brand's `publish.yml` built the release's archive for its tag on a GitHub-hosted runner, and the archive holds exactly the files its manifest lists, at their SHA-256 ([ADR-1008](decisions/1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md)) |
| The brand watch's token, which can write issues, runs code a pull request changed | Yes | `.github/workflows/brand-watch.yml` runs only on its schedule and when a maintainer starts it, from the default branch; its job may write issues and nothing else, and its checkout keeps no credentials |
| A library's own page writes harmful HTML or script into its site | No | The page is the library's code, reviewed in the library (Security Requirements) |

## Input Validation

Each input from a library or a caller, and the check it gets before the build uses it:

| Input | Check |
| --- | --- |
| `content-path` (the workflow's input, `DOCS_CONTENT`, `--content`) | A relative path without `..` (`resolveLibrary` in `src/library.mjs`); a symbolic link on it is followed |
| `deploy` | A boolean, which publishes only together with a run on the default branch |
| `toolchain-ref` | None: when the caller sets it, it is checked out as given, in place of `job.workflow_sha`; a library sets it only where `job.workflow_sha` is missing, and keeps it equal to its pin |
| `site.config.json` | Parsed as JSON and checked against `schema/site.config.schema.json` by `src/json-schema.mjs`, which names each problem by its key and rejects an unknown key; `requiredHeadings` is also checked against the library's pages before the build (R5) |
| `samples` globs | Each file a glob matches is checked by its path and its real path (R4) |
| `file=` blocks | Path form, real path, `.git`, size and UTF-8 (`src/includes/files.mjs`), and `from`/`to` each naming one line |
| `_components/` files | Each `--nc-` token read is one the brand defines and is no ramp or scale step (`src/brand/tokens.mjs`) |
| Sample files | `src/snippets/catalog.mjs` checks each marker's spelling, each key's form, and that no key is defined twice and no region is unclosed or empty |
| Pages | `snippet=` blocks (`src/snippets/code-block.mjs`), frontmatter through Starlight's schema, and links (R5) |
| `scripts/site.mjs`'s arguments, `SITE_URL` and `DOCS_OUT` | `parseArgs` in strict mode and a known command; `SITE_URL` must parse as a URL; an output folder Astro would misplace stops `build` and `preview` |

## Secure Design Principles Applied

- **Economy of mechanism:** Starlight's core with one add-on; the samples, links and grammar patch are the project's
  own code with no dependency of their own; `src/json-schema.mjs` implements only the keywords the schema uses and
  throws on any other.
- **Fail-safe defaults:** `deploy` is false unless the caller sets it, and only the default branch publishes; a run
  that knows no toolchain commit stops instead of taking a branch; an unknown key in `site.config.json` is an error; a
  sample or a link the build cannot place stops it (R5).
- **Complete mediation:** every file a samples glob matches is checked by its real path, and after the build every URL
  attribute of every tag of every built page is read.
- **Least privilege:** the workflow's top-level permissions are empty; `build` only reads; only `deploy`, which runs
  nothing of the library or the toolchain, writes to GitHub Pages, with an OIDC token instead of a stored secret; no
  checkout keeps its credentials; `--omit=dev` installs no devDependency; this repository's CI token only reads.
- **Open design:** the toolchain, the workflow, the tests and the decision records are public, and no build depends on
  a secret.

## Common Weaknesses Countered

- CWE-20, improper input validation: R5 and [Input Validation](#input-validation).
- CWE-22 and CWE-59, path traversal and link following: R4.
- CWE-78 and CWE-94, command and code injection: `scripts/site.mjs` and `src/library.mjs` start Astro and git with a
  list of arguments and no shell, and the workflow's inputs reach the script through `env`.
- CWE-117, improper output neutralization for logs: `readLastUpdated` in `src/library.mjs` writes only the first line
  of git's message, with `%` escaped, as a workflow command.
- CWE-250, execution with unnecessary privileges: R1 and R2.
- CWE-494, download of code without an integrity check: R3, since `npm ci` checks each package against the lockfile's
  hash, and a brand release's files are written only from an archive whose build provenance `gh attestation verify`
  proves, and checked against their SHA-256 afterwards.
- CWE-829, inclusion of functionality from an untrusted control sphere: R3, R6, and actions pinned by full commit SHA.
- CWE-1395, dependency on a vulnerable third-party component: Dependabot's updates and alerts.

## Evidence

- **Gate:** CI runs the file-header check (`./.template/Test-FileHeaders.ps1`), Biome's format and lint check
  (`npm run lint`), the tests and the coverage check below on every pull request (`.github/workflows/ci.yml`).
- **Tests and coverage:** `npm run test` builds the fixture library and broken copies of it, and CI fails when the
  tests cover less than 90% of the statements or 80% of the branches of the toolchain's code;
  `.github/workflows/tag-release.yml` runs CI again on each release's commit before it tags it
  ([ADR-0026](decisions/project-template/0026-tests-gate-coverage-at-the-gold-thresholds-and-a-release-waits-for-them.md)).
- **Requirements under test:** `test/config.test.mjs` checks R4, a content path, a samples glob, a symbolic link or a
  `bin` folder that leads out of the library, and the schema check of R5; `test/includes.test.mjs` checks the path,
  link, size and text rules of an included file (R4) and each way an include can be wrong (R5); `test/library.test.mjs`
  and `test/headings.test.mjs` check that a page without a required heading, or with them out of order, and a rule that
  matches no page stop the build (R5); `test/tokens.test.mjs` checks that a component that reads a token the brand
  does not offer stops the build (R5); `test/samples.test.mjs` breaks a copy of the
  fixture in each way a sample or a link can be wrong (R5); `test/build.test.mjs` and `test/links.test.mjs` check the
  base path on the built pages (R5); `test/build.test.mjs` and `test/browser.test.mjs` check that a built page, and the
  browser that loads it, ask no other origin for anything (R6); `test/vendor.test.mjs` runs the vendored brand files'
  check, and fails when the theme reads a custom property no vendored stylesheet defines, or a step of the brand's
  colour ramps or type scale.
  `test/workflow.test.mjs` reads `.github/workflows/site.yml` and `.npmrc` for R1 to R3: each job's permissions, the
  checkouts that keep no credentials, the deploy job that runs only from the default branch and checks out and runs
  nothing, the toolchain checked out at the pinned commit and the step that stops a run without one, the actions
  pinned by commit, the install without scripts or a cache, and npm's three-day minimum release age.
- **Static analysis:** with CodeQL's default setup configured and analyzing at least one language, the repository
  ruleset blocks a pull request that adds a CodeQL alert at warning level or above, or a security alert of any severity
  ([ADR-0005](decisions/project-template/0005-the-default-branch-accepts-changes-only-through-pull-requests.md),
  [ADR-0030](decisions/project-template/0030-the-code-scanning-rule-is-added-only-where-codeql-analyzes-a-language.md)).
- **Review:** every change reaches the default branch through a pull request with passing CI and every conversation
  resolved, and the ruleset refuses force pushes and deletion
  ([ADR-0005](decisions/project-template/0005-the-default-branch-accepts-changes-only-through-pull-requests.md),
  [ADR-0014](decisions/project-template/0014-every-pull-request-discussion-is-remediated-and-replied-to-before-it-merges.md)).
  NCode Review reviews each pull request and approves a clean one.
- **Dependencies:** pinned, and moved by reviewed updates
  ([ADR-0008](decisions/project-template/0008-external-inputs-are-pinned-and-kept-current.md)) that wait three days for
  a new version ([ADR-0009](decisions/project-template/0009-new-dependency-versions-wait-a-cooldown.md)). Dependabot proposes the updates.
- **Response:** [SECURITY.md](../SECURITY.md) defines private reporting, coordinated disclosure and credit.

## Security Reviews

[//]: # "Maintainers: record each security review, newest first: its date, who did it, what it covered (the security requirements and the trust boundary above) and what it found. The OpenSSF Best Practices gold level asks for one in the last five years."

None recorded yet.
