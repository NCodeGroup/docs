# 1008. The brand is vendored from an attested release, and the theme restyles only Starlight's markup

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** NCode Group
- **Amends:** 1000, and project-template ADR-0009 for releases of NCodeGroup/brand

## Context

NCode's design system, Instrument, is released from NCodeGroup/brand: each release is a signed tag and an immutable
GitHub release with one archive, `brand-<version>.tar.gz`, and its build provenance attestation.
`vendoring/vendor-brand.mjs` vendors the files a consumer's `brand.lock.json` names from it (brand's ADR-1001 and
ADR-1009). Brand's ADR-1002 prefixes every custom property `--nc-` and makes only the semantic tokens public; its
ADR-1005 ships `css/starlight.css`, Starlight's custom properties mapped onto the tokens, and leaves the rules for
Starlight's markup to the toolchain, beside the Starlight version they were written for; its ADR-1012 ships
`syntax/instrument-screen.json`. NCode Brand 0.9.0, read 2026-11-17.

`.template/Test-FileHeaders.ps1` fails every tracked JavaScript file without the copyright and SPDX lines
(project-template ADR-0027), and brand's `vendor-brand.mjs` has neither. Biome's formatting differs from brand's, and
the coverage gate counts every script the tests run.

Project-template ADR-0009 holds a dependency version for three days because a compromised third-party release is
usually withdrawn within days. A brand release is NCode Group's own: brand's `publish.yml` builds it from a tag `main`
holds, publishes it only once a maintainer approves its `release` environment, and attests it. The third-party files
in it, the fonts and Lucide's icons, wait three days in brand before brand pins them.

## Decision

**The brand's files are vendored from an attested release, and the theme restyles only Starlight's markup.**

1. `vendor/brand/` holds the files `vendor/brand/brand.lock.json` names from one brand release, in the release's own
   folders. `npm run update:brand -- <version>` runs `--update`, which writes them only once `gh attestation verify`
   proves the archive. `npm run check:vendor` runs `--check`, offline, and `test/vendor.test.mjs` runs it in CI.
2. `scripts/vendor-brand.mjs` is brand's `vendoring/vendor-brand.mjs` with only the lines
   `./.template/Test-FileHeaders.ps1 -Fix` adds after its `#!` line. Biome and the coverage leave it out, as brand's
   code, tested in brand.
3. `customCss` loads `tokens/tokens.css`, `css/fonts.css`, `css/starlight.css`, then `src/styles/theme.css`, which
   holds only rules for Starlight's markup and reads the tokens by their `--nc-` names. `ec.config.mjs` takes
   `syntax/instrument-screen.json` and keeps the frame's style overrides. This amends ADR-1000's second decision: the
   brand's `css/starlight.css` maps Starlight's custom properties onto the tokens.
4. A library's component reads only the brand's public tokens. `test/vendor.test.mjs` fails when the theme, the code
   blocks or a component reads a custom property that neither the brand's stylesheets nor the theme define.
5. A brand release is taken when it is published, without ADR-0009's three-day wait.

## Options considered

- **An npm package of the brand.** Rejected: brand publishes none (brand's ADR-1001).
- **A byte-for-byte copy of `vendor-brand.mjs` pinned in the lock.** Rejected while brand's copy has no header: the
  header check fails it.
- **This repository's own lock check without brand's script.** Rejected: `--update`'s attestation and archive checks
  would be written twice.
- **Holding a brand release three days.** Rejected: the wait guards against a third party's release, and a brand
  release is attested, approved and immutable before it is published.
- **Brand's script with the header added, in `scripts/`** (chosen).

## Consequences

- A brand release reaches the sites through a pull request whose diff shows every vendored line it changes.
- No update arrives by itself, since Dependabot cannot see vendored files, so a person runs `npm run update:brand`.
- When a release changes `vendoring/vendor-brand.mjs`, `scripts/vendor-brand.mjs` is copied again by hand and `-Fix`
  run again.
- A release that renames or removes a token the theme reads fails the tests.
- The theme reads some of the brand's private primitives, the steps of the type scale and two colour ramps, which a
  brand release may change.

## References

- `vendor/brand/brand.lock.json`, `scripts/vendor-brand.mjs`, `astro.config.mjs`, `ec.config.mjs`,
  `src/styles/theme.css`, `test/vendor.test.mjs`, `CONTRACT.md`
- [NCodeGroup/brand](https://github.com/NCodeGroup/brand): its ADR-1001, 1002, 1005, 1009, 1012 and
  `guidelines/12-applying.md`.
- [ADR-1000](1000-library-sites-are-built-with-astro-starlight-core-only.md): the site generator, which this record
  amends.
- [project-template ADR-0009](project-template/0009-new-dependency-versions-wait-a-cooldown.md) and
  [ADR-0027](project-template/0027-source-files-carry-a-copyright-and-spdx-license-header.md)
- [#2](https://github.com/NCodeGroup/docs/issues/2)
