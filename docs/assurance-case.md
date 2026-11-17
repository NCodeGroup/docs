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
  names: the toolchain is checked out at `job.workflow_sha` or `toolchain-ref`, never at a branch,
  `npm ci --ignore-scripts --omit=dev` installs the packages, and no job restores or saves a cache.
- **R4.** The build reads a library's files only from inside its repository: the content path is a relative folder
  without `..`, each sample file is checked by its real path with every symbolic link on it followed, and `bin`,
  `obj`, `node_modules`, `TestResults` and `.git` are never read.
- **R5.** What the build cannot place stops it: a `site.config.json` the schema rejects, a sample that is wrong or
  missing, and a link that is broken, relative, written with the base path or left outside it
  ([ADR-1002](decisions/1002-a-page-includes-a-compiled-sample-by-its-key-when-the-site-is-built.md),
  [ADR-1003](decisions/1003-links-are-written-from-the-site-root-and-the-build-proves-none-leaves-the-base-path.md)).
- **R6.** A built site loads its fonts, scripts and styles from its own origin.

Users must not rely on the toolchain to check a library's pages: the build runs a page and a component as code and
publishes the HTML they write as written, so a library reviews its pages as it reviews its code. External links are
published unchecked. Where the `job.workflow_*` properties are missing, as on GitHub Enterprise Server, R3 holds only
while the library keeps `toolchain-ref` equal to its pin.

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
| A content path, a samples glob or a symbolic link makes the build read a file outside the library | Yes | R4: `resolveLibrary` in `src/library.mjs` |
| A wrong sample or a broken link is published | Yes | R5 |
| A published site loads code or fonts from another origin, which can change after the build | Yes | R6: the fonts are vendored in `vendor/instrument/`, and the tests check every built page and every request a browser makes |
| A vendored theme file is edited here and drifts from its source | Yes | `scripts/check-vendor.mjs`, which the tests run, compares each file with the SHA-256 in `manifest.json` |
| A library's own page writes harmful HTML or script into its site | No | The page is the library's code, reviewed in the library (Security Requirements) |

## Input Validation

Each input from a library or a caller, and the check it gets before the build uses it:

| Input | Check |
| --- | --- |
| `content-path` (the workflow's input, `DOCS_CONTENT`, `--content`) | A relative folder inside the library, without `..` (`resolveLibrary` in `src/library.mjs`) |
| `deploy` | A boolean, which publishes only together with a run on the default branch |
| `toolchain-ref` | Used only where `job.workflow_sha` is missing, as the commit of the toolchain to check out |
| `site.config.json` | Parsed as JSON and checked against `schema/site.config.schema.json` by `src/json-schema.mjs`, which names each problem by its key and rejects an unknown key |
| `samples` globs | Each file a glob matches is checked by its path and its real path (R4) |
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

[//]: # "Maintainers: list the CWE ids the design counters, each with the requirement that counters it."

Not written yet.

## Evidence

[//]: # "Maintainers: add the tests and the coverage the project keeps."

- **Gate:** CI runs the project's commands on every pull request.
- **Tests and coverage:** `npm run test` builds the fixture library and broken copies of it, and CI fails when the
  tests cover less than 90% of the statements or 80% of the branches of the toolchain's code;
  `.github/workflows/tag-release.yml` runs CI again on each release's commit before it tags it
  ([ADR-0026](decisions/project-template/0026-tests-gate-coverage-at-the-gold-thresholds-and-a-release-waits-for-them.md)).
- **Static analysis:** with CodeQL's default setup configured, the repository ruleset blocks a pull request that adds a
  CodeQL alert at warning level or above, or a security alert of any severity
  ([ADR-0005](decisions/project-template/0005-the-default-branch-accepts-changes-only-through-pull-requests.md)).
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
