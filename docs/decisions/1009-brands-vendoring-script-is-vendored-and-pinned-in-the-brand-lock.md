# 1009. Brand's vendoring script is vendored and pinned in the brand lock

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NCode Group
- **Amends:** 1008

## Context

ADR-1008 vendors the brand's files with NCodeGroup/brand's `vendoring/vendor-brand.mjs`, which downloads a release's
archive, has `gh attestation verify` prove it, and checks the vendored files against `vendor/brand/brand.lock.json`.
`.template/Test-FileHeaders.ps1` fails every tracked JavaScript file without the `Copyright © NCode Group` and
`SPDX-License-Identifier: Apache-2.0` lines (project-template ADR-0027). From NCode Brand 0.10.0, read 2026-11-17,
brand's script starts with those lines, and the release's `manifest.json` lists it with its SHA-256, so a lock can
name it like any other released file ([NCodeGroup/brand#28](https://github.com/NCodeGroup/brand/issues/28)).

## Decision

**`vendor/brand/vendoring/vendor-brand.mjs` is brand's script as the release ships it, named in
`vendor/brand/brand.lock.json` and pinned by its SHA-256 like every other brand file.**

1. `npm run update:brand '--' <version>` writes the script of the release it takes, with the release's other files,
   and `npm run check:vendor` fails when the script differs from the SHA-256 the lock pins.
2. `npm run check:vendor` and `npm run update:brand` run that copy, and no other copy of the script is kept.
3. Biome and the coverage leave out `vendor/`, which holds only copies; the script is brand's code, tested in brand.
   The header check skips `vendor/`, so the script keeps brand's own lines as the release ships them.

This amends ADR-1008's second decision and its option "a byte-for-byte copy of `vendor-brand.mjs` pinned in the
lock".

## Options considered

- **Brand's script with the header added, in `scripts/`.** Rejected: no check ties the copy to a release, and each
  release that changes the script needs a person to copy it and add the header again.
- **Brand's script pinned in the lock, unchanged** (chosen).

## Consequences

- A release that changes the script reaches this repository through `npm run update:brand`, in the same diff as the
  rest of the release's files.
- `--update` runs the copy it replaces, so the release's script runs from the next command on.
- `.template/Test-FileHeaders.ps1` skips `vendor/`, as other authors' code, so a release is taken whatever header
  lines its script carries.

## References

- `vendor/brand/brand.lock.json`, `vendor/brand/vendoring/vendor-brand.mjs`, `package.json`, `biome.json`
- [ADR-1008](1008-the-brand-is-vendored-from-an-attested-release-and-the-theme-restyles-only-starlights-markup.md),
  which this record amends.
- [project-template ADR-0027](project-template/0027-source-files-carry-a-copyright-and-spdx-license-header.md)
- [#27](https://github.com/NCodeGroup/docs/issues/27), [NCodeGroup/brand#28](https://github.com/NCodeGroup/brand/issues/28)
