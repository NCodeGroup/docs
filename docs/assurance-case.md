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

[//]: # "Maintainers: add a table (Threat, In scope, Countered by) and state the trust boundary."

Not written yet.

## Secure Design Principles Applied

[//]: # "Maintainers: say how the design applies economy of mechanism, fail-safe defaults, complete mediation, least
privilege and open design."

Not written yet.

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
