# Governance

NCode Docs belongs to NCode Group, under `Apache-2.0`. This page says who does
what and how decisions are made.

## Roles

| Role | Who | Responsibilities |
| --- | --- | --- |
| Maintainer | [@polewskm](https://github.com/polewskm) | Sets direction, triages issues, reviews and merges pull requests, answers vulnerability reports, owns the repository's settings |
| Contributor | Anyone | Opens issues and pull requests, under [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) |
| Automation | `ncode-review[bot]`, Dependabot, GitHub Actions | Reviews and approves a clean pull request, proposes dependency updates, runs CI, tags and publishes releases where `AGENTS.md`'s Landing section sets `release: tag+release`; never merges a pull request except the pin bump `code-review-auto-merge.yml` merges once a maintainer approves it |

Only a maintainer has write access. A contributor who keeps contributing reviewed, merged work can be invited to become
a maintainer; the existing maintainers decide, and the change is recorded in this file.

## Decisions

- Day-to-day decisions are made in issues and pull requests. Anyone can comment; a maintainer decides.
- A decision someone would otherwise re-argue is recorded as an architecture decision record in
  [docs/decisions/](docs/decisions/README.md), before or with the pull request that builds it. A change consumers can
  observe, such as to the public API, behavior or security posture, starts as an issue.
- Where maintainers disagree, they discuss it on the issue; with no agreement, the change doesn't happen.

## Releases

Versions follow Semantic Versioning. `AGENTS.md`'s Landing section sets `release: tag+release`, so each release is tagged
and published as its pull request merges, as
[ADR-0016](docs/decisions/project-template/0016-releases-are-tagged-and-published-when-their-pull-request-merges.md)
records.

## Continuity

The repository, its issues, decision records, build, release automation and documentation are all in the
GitHub organization that owns it, so anyone given access can carry
on with no knowledge held elsewhere.

Owners today: [@polewskm](https://github.com/polewskm). Continuity
needs at least two people who can administer the repository; until there are
two, it is incomplete, and the OpenSSF Best Practices silver level can't be claimed
([docs/best-practices-badge.md](docs/best-practices-badge.md)).

## Changing This Document

Governance changes through a pull request to this file, which a maintainer merges.
